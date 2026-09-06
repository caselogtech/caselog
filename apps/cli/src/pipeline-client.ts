import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export class PipelineError extends Error {
  override readonly name = 'PipelineError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requestJson(input: {
  apiUrl: URL;
  path: string;
  method: string;
  token: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal: AbortSignal;
}): Promise<unknown> {
  const body = input.body ? JSON.stringify(input.body) : undefined;
  const key =
    input.idempotencyKey ??
    `cli:${createHash('sha256')
      .update(`${input.method}:${input.path}:${body ?? ''}`)
      .digest('hex')}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(new URL(input.path, input.apiUrl), {
        method: input.method,
        redirect: 'error',
        signal: input.signal,
        headers: {
          authorization: `Bearer ${input.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'idempotency-key': key,
        },
        body,
      });
    } catch {
      if (input.signal.aborted)
        throw new PipelineError(
          'cancelled_or_timed_out',
          'The operation was cancelled or timed out',
        );
      if (attempt < 2) {
        await delay(250 * (attempt + 1), undefined, { signal: input.signal });
        continue;
      }
      throw new PipelineError('network_error', 'Could not reach the Caselog API');
    }
    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      await response.body?.cancel();
      await delay(250 * (attempt + 1), undefined, { signal: input.signal });
      continue;
    }
    const value = await boundedJson(response);
    if (!response.ok) {
      const error = isRecord(value) && isRecord(value.error) ? value.error : null;
      const code =
        typeof error?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : 'api_error';
      throw new PipelineError(
        code,
        `Caselog rejected the request (HTTP ${response.status}, ${code})`,
      );
    }
    return value;
  }
  throw new PipelineError('network_error', 'Could not complete the request');
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body)
    throw new PipelineError('invalid_response', 'Caselog returned an empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 1_048_576) {
      await reader.cancel();
      throw new PipelineError('invalid_response', 'Caselog response exceeded the size limit');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new PipelineError('invalid_response', 'Caselog returned invalid JSON');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
