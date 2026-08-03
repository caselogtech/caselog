import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { UploadCommand } from './arguments.js';
import { parseApiError, parseJUnitUploadResponse, type JUnitUploadResponse } from './contracts.js';

export type UploadedFile = {
  file: string;
  response: JUnitUploadResponse;
};

export type UploadSummary = {
  files: UploadedFile[];
  total: number;
  recorded: number;
  unmatched: number;
  truncated: number;
  counts: JUnitUploadResponse['counts'];
};

export class UploadError extends Error {
  override readonly name = 'UploadError';
}

export async function uploadJUnit(command: UploadCommand): Promise<UploadSummary> {
  const files = await resolveJUnitFiles(command.inputPath);
  const uploaded: UploadedFile[] = [];

  for (const file of files) {
    const digest = await sha256File(file);
    const response = await uploadFile(command, file, digest, files.length);
    uploaded.push({ file: displayPath(file), response });
  }

  return summarize(uploaded);
}

export async function resolveJUnitFiles(inputPath: string): Promise<string[]> {
  const absolutePath = resolve(inputPath);
  let inputStat: Awaited<ReturnType<typeof stat>>;
  try {
    inputStat = await stat(absolutePath);
  } catch {
    throw new UploadError(`Input path does not exist: ${inputPath}`);
  }

  if (inputStat.isFile()) return [absolutePath];
  if (!inputStat.isDirectory()) throw new UploadError('Input path must be a file or directory');

  const files = await collectXmlFiles(absolutePath);
  if (files.length === 0) throw new UploadError(`No JUnit XML files found in ${inputPath}`);
  return files.sort((left, right) => left.localeCompare(right));
}

async function collectXmlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectXmlFiles(path)));
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.xml') files.push(path);
  }
  return files;
}

async function sha256File(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function uploadFile(
  command: UploadCommand,
  file: string,
  digest: string,
  fileCount: number,
): Promise<JUnitUploadResponse> {
  const fileStat = await stat(file);
  const idempotencyKey = requestIdempotencyKey(command, digest, fileCount);
  const endpoint = new URL(
    `projects/${encodeURIComponent(command.projectSlug)}/runs/${encodeURIComponent(command.runId)}/results/junit`,
    command.apiUrl,
  );

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${command.token}`,
        'content-type': 'application/xml',
        'content-length': String(fileStat.size),
        'idempotency-key': idempotencyKey,
      },
      body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    throw new UploadError(`Could not upload ${displayPath(file)}: ${reason}`);
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const apiError = parseApiError(payload);
    const detail = apiError
      ? `${apiError.error.message} [${apiError.error.code}]`
      : `HTTP ${response.status}`;
    throw new UploadError(`Upload failed for ${displayPath(file)}: ${detail}`);
  }
  const parsed = parseJUnitUploadResponse(payload);
  if (!parsed) {
    throw new UploadError(`Caselog returned an invalid response for ${displayPath(file)}`);
  }
  return parsed;
}

function requestIdempotencyKey(command: UploadCommand, digest: string, fileCount: number): string {
  if (!command.idempotencyKey) return `junit:${command.runId}:${digest}`;
  if (fileCount === 1) return command.idempotencyKey;
  return `${command.idempotencyKey.slice(0, 126)}:${digest}`;
}

function summarize(files: UploadedFile[]): UploadSummary {
  const summary: UploadSummary = {
    files,
    total: 0,
    recorded: 0,
    unmatched: 0,
    truncated: 0,
    counts: { passed: 0, failed: 0, error: 0, skipped: 0 },
  };
  for (const { response } of files) {
    summary.total += response.total;
    summary.recorded += response.recorded;
    summary.unmatched += response.unmatched.length;
    summary.truncated += response.truncated;
    for (const status of ['passed', 'failed', 'error', 'skipped'] as const) {
      summary.counts[status] += response.counts[status];
    }
  }
  return summary;
}

function displayPath(path: string): string {
  const local = relative(process.cwd(), path);
  return local && !local.startsWith('..') ? local : basename(path);
}
