import { isUuid } from './cli-input.js';
import type { PipelineCommand } from './pipeline-arguments.js';
import { isRecord, PipelineError } from './pipeline-client.js';

export type PipelineResult = {
  version: 1;
  command: string;
  exitCode: 0 | 1 | 2;
  data: Record<string, unknown>;
};

export function pipelineResponse(command: PipelineCommand, value: unknown): PipelineResult {
  if (!isRecord(value)) throw invalid();
  const data = command.resource === 'readiness' ? value : value[command.resource];
  if (!isRecord(data)) throw invalid();
  if (command.resource !== 'readiness') {
    const identity = command.resource === 'link' ? data.testRunId : data.id;
    if (typeof identity !== 'string' || !isUuid(identity)) throw invalid();
    if (command.resource === 'assignment' && data.candidateId !== command.candidateId)
      throw invalid();
    if (command.resource === 'observation' && data.candidateId !== command.candidateId)
      throw invalid();
    return { version: 1, command: command.action, exitCode: 0, data };
  }
  if (
    data.candidateId !== command.candidateId ||
    !['pending', 'current', 'stale', 'failed'].includes(String(data.state))
  )
    throw invalid();
  const decision = data.decision;
  if (
    decision !== null &&
    (!isRecord(decision) ||
      typeof decision.id !== 'string' ||
      !isUuid(decision.id) ||
      !Array.isArray(decision.gates))
  )
    throw invalid();
  if (data.state !== 'current' || !isRecord(decision))
    return { version: 1, command: command.action, exitCode: 2, data };
  if (
    !Number.isSafeInteger(data.currentEvidenceRevision) ||
    decision.evidenceRevision !== data.currentEvidenceRevision ||
    decision.candidateId !== command.candidateId
  )
    throw invalid();
  if (!['ready', 'at_risk', 'blocked', 'unknown'].includes(String(decision.status)))
    throw invalid();
  const disposition = decision.effectiveDisposition;
  if (
    !['ready', 'at_risk', 'blocked', 'unknown', 'approved_with_waiver'].includes(
      String(disposition),
    )
  )
    throw invalid();
  // Warning gates remain non-blocking. The server owns gate and waiver computation.
  const exitCode = disposition === 'blocked' ? 1 : disposition === 'unknown' ? 2 : 0;
  return { version: 1, command: command.action, exitCode, data };
}

function invalid(): PipelineError {
  return new PipelineError(
    'invalid_response',
    'Caselog returned an invalid or mismatched response',
  );
}

export function humanPipelineResult(result: PipelineResult): string {
  if (!isRecord(result.data.decision))
    return `${result.command}: ${String(result.data.id ?? result.data.state ?? result.data.testRunId)}`;
  const decision = result.data.decision;
  const lines = [
    `Readiness: ${String(decision.effectiveDisposition)} (${String(result.data.state)})`,
    `Decision: ${String(decision.id)}`,
  ];
  for (const gate of Array.isArray(decision.gates) ? decision.gates : []) {
    if (isRecord(gate) && gate.result !== 'passed')
      lines.push(`${String(gate.gateKey)}: ${String(gate.result)} (${String(gate.diagnostic)})`);
  }
  return lines.join('\n');
}
