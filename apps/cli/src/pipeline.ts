import { open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { PipelineCommand } from './pipeline-arguments.js';
import { isRecord, PipelineError, requestJson } from './pipeline-client.js';
import { pipelineResponse, type PipelineResult } from './pipeline-response.js';

export async function runPipeline(
  command: PipelineCommand,
  signal?: AbortSignal,
): Promise<PipelineResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), command.timeoutMs);
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const body = command.file
      ? await evidenceBody(command.file, command.candidateId)
      : command.body;
    for (;;) {
      const value = await requestJson({
        ...command,
        body: command.method === 'GET' ? undefined : body,
        signal: combined,
      });
      const result = pipelineResponse(command, value);
      if (
        !command.wait ||
        command.resource !== 'readiness' ||
        (result.exitCode !== 2 && !awaitingEvidence(result)) ||
        result.data.state === 'failed'
      )
        return result;
      await delay(command.pollMs, undefined, { signal: combined });
    }
  } catch (error) {
    if (combined.aborted)
      throw new PipelineError('cancelled_or_timed_out', 'The operation was cancelled or timed out');
    if (error instanceof PipelineError) throw error;
    throw new PipelineError('operation_failed', 'Could not complete the pipeline operation');
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

async function evidenceBody(
  path: string,
  candidateId: string | undefined,
): Promise<Record<string, unknown>> {
  const file = await open(path, 'r');
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > 1_048_576)
      throw new PipelineError(
        'invalid_evidence',
        'Evidence must be a JSON file no larger than 1 MiB',
      );
    const buffer = Buffer.alloc(1_048_577);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 1_048_576)
      throw new PipelineError('invalid_evidence', 'Evidence exceeds 1 MiB');
    let value: unknown;
    try {
      value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    } catch {
      throw new PipelineError('invalid_evidence', 'Evidence must contain valid JSON');
    }
    if (!isRecord(value) || (value.candidateId !== undefined && value.candidateId !== candidateId))
      throw new PipelineError('invalid_evidence', 'Evidence candidate does not match --candidate');
    return { ...value, candidateId };
  } finally {
    await file.close();
  }
}

function awaitingEvidence(result: PipelineResult): boolean {
  if (result.exitCode === 0 || !isRecord(result.data.decision)) return false;
  const gates = result.data.decision.gates;
  if (!Array.isArray(gates)) return false;
  const unresolved = gates.filter((gate) => isRecord(gate) && gate.result !== 'passed');
  return (
    unresolved.length > 0 &&
    unresolved.every(
      (gate) =>
        isRecord(gate) && ['missing', 'incomplete', 'stale'].includes(String(gate.diagnostic)),
    )
  );
}
