import { parseArgs } from 'node:util';

export type UploadCommand = {
  kind: 'upload';
  inputPath: string;
  projectSlug: string;
  runId: string;
  apiUrl: URL;
  token: string;
  idempotencyKey?: string;
  json: boolean;
  failOnUnmatched: boolean;
};

export type ParsedCommand = UploadCommand | { kind: 'help' };

export class CliInputError extends Error {
  override readonly name = 'CliInputError';
}

export function parseCommand(argv: string[], environment: NodeJS.ProcessEnv): ParsedCommand {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        project: { type: 'string', short: 'p' },
        run: { type: 'string', short: 'r' },
        format: { type: 'string', short: 'f', default: 'junit' },
        'api-url': { type: 'string' },
        'idempotency-key': { type: 'string' },
        json: { type: 'boolean', default: false },
        'fail-on-unmatched': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    throw new CliInputError(error instanceof Error ? error.message : 'Invalid command arguments');
  }

  if (parsed.values.help) return { kind: 'help' };
  const [command, inputPath, ...extraPositionals] = parsed.positionals;
  if (command !== 'upload') throw new CliInputError('Expected the command "upload"');
  if (!inputPath || extraPositionals.length > 0) {
    throw new CliInputError('Upload requires exactly one file or directory path');
  }
  if (parsed.values.format !== 'junit') {
    throw new CliInputError('Only --format junit is currently supported');
  }

  const projectSlug = parsed.values.project;
  const runId = parsed.values.run;
  if (
    typeof projectSlug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectSlug) ||
    projectSlug.length > 50 ||
    typeof runId !== 'string' ||
    !isUuid(runId)
  ) {
    throw new CliInputError(
      'Both --project <slug> and --run <uuid> are required and must be valid',
    );
  }

  const token = environment.CASELOG_TOKEN?.trim();
  if (!token) throw new CliInputError('CASELOG_TOKEN is required');
  const apiUrlOption = parsed.values['api-url'];
  if (apiUrlOption !== undefined && typeof apiUrlOption !== 'string') {
    throw new CliInputError('--api-url must be a string');
  }
  const apiUrl = parseApiUrl(apiUrlOption ?? environment.CASELOG_API_URL);
  const idempotencyKeyOption = parsed.values['idempotency-key'];
  if (idempotencyKeyOption !== undefined && typeof idempotencyKeyOption !== 'string') {
    throw new CliInputError('--idempotency-key must be a string');
  }
  const idempotencyKey = idempotencyKeyOption?.trim();
  if (
    idempotencyKey !== undefined &&
    (idempotencyKey.length === 0 || idempotencyKey.length > 200)
  ) {
    throw new CliInputError('--idempotency-key must contain between 1 and 200 characters');
  }

  return {
    kind: 'upload',
    inputPath,
    projectSlug,
    runId,
    apiUrl,
    token,
    idempotencyKey,
    json: parsed.values.json === true,
    failOnUnmatched: parsed.values['fail-on-unmatched'] === true,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseApiUrl(value: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(value?.trim() || 'http://localhost:3000/api/v1');
  } catch {
    throw new CliInputError('CASELOG_API_URL or --api-url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CliInputError('Caselog API URL must use http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CliInputError('Caselog API URL must not contain credentials, query, or fragment');
  }
  if (url.pathname === '/') url.pathname = '/api/v1/';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
