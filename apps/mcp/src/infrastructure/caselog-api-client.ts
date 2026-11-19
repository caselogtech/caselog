import { apiErrorSchema } from '@caselog/schemas/api-error';
import type { z } from 'zod';
import type { McpConfiguration } from '../domain/configuration.js';
import { ToolError } from '../domain/tool-error.js';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export type ApiRequest<T> = {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  responseSchema: z.ZodType<T>;
  query?: object;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export class CaselogApiClient {
  constructor(private readonly configuration: McpConfiguration) {}

  async request<T>(request: ApiRequest<T>): Promise<T> {
    const url = new URL(`${this.configuration.apiUrl}${request.path}`);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    if (body && Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new ToolError('request_too_large', 'The tool request exceeds 1 MiB');
    }
    const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
    try {
      const response = await fetch(url, {
        method: request.method,
        redirect: 'manual',
        signal,
        headers: {
          authorization: `Bearer ${this.configuration.token}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(request.idempotencyKey ? { 'idempotency-key': request.idempotencyKey } : {}),
        },
        body,
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new ToolError(
          'api_redirect_refused',
          'Configure the API URL directly; redirects are not followed',
        );
      }
      const value = await readBoundedJson(response);
      if (!response.ok) throw apiFailure(response.status, value, this.configuration.token);
      const parsed = request.responseSchema.safeParse(value);
      if (!parsed.success)
        throw new ToolError(
          'invalid_api_response',
          'The API response does not match the Caselog contract',
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ToolError) throw error;
      if (request.signal?.aborted)
        throw new ToolError(
          'request_cancelled',
          'The tool request was cancelled; a write may have completed',
        );
      if (deadline.aborted)
        throw new ToolError(
          'request_timeout',
          'The API request timed out; retry writes only with the same idempotency key',
        );
      throw new ToolError(
        'api_unavailable',
        'Unable to reach the API; retry writes only with the same idempotency key',
      );
    }
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ToolError('invalid_api_response', 'The API returned an empty response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ToolError(
          'invalid_api_response',
          'The API response exceeds 2 MiB; request a smaller page',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ToolError('invalid_api_response', 'The API returned invalid JSON');
  }
}

function apiFailure(status: number, value: unknown, credential: string): ToolError {
  const parsed = apiErrorSchema.safeParse(value);
  const error = parsed.success ? parsed.data.error : undefined;
  // Never echo an upstream message, body or arbitrary details into the model context.
  const code =
    error && /^[a-z][a-z0-9_.-]{0,79}$/.test(error.code) && !error.code.includes(credential)
      ? error.code
      : 'api_error';
  const requestId =
    error &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(error.requestId) &&
    !error.requestId.includes(credential)
      ? error.requestId
      : undefined;
  const version = error?.details.currentVersion;
  const message =
    status === 401
      ? 'The workspace API token is invalid or expired'
      : status === 403
        ? 'The token scope or current workspace role does not allow this operation'
        : status === 404
          ? 'The requested resource was not found in this workspace'
          : status === 409
            ? 'The request conflicts with current state; inspect the error code before retrying'
            : status === 400
              ? 'The API rejected the request; check the tool arguments'
              : status === 429
                ? 'The API rate limit was reached; retry later with the same write key'
                : 'The API could not complete the request';
  return new ToolError(code, message, {
    status,
    requestId,
    currentVersion:
      typeof version === 'number' && Number.isSafeInteger(version) && version > 0
        ? version
        : undefined,
  });
}
