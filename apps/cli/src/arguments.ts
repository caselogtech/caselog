import { parseArgs } from 'node:util';
import { CliInputError, isUuid, parseApiUrl } from './cli-input.js';
import { parsePipelineCommand, type PipelineCommand } from './pipeline-arguments.js';
export { CliInputError } from './cli-input.js';

export type UploadCommand = {
  kind: 'upload';
  inputPath: string;
  projectSlug: string;
  runId: string;
  candidateId?: string;
  apiUrl: URL;
  token: string;
  idempotencyKey?: string;
  json: boolean;
  failOnUnmatched: boolean;
};

export type ParsedCommand = UploadCommand | PipelineCommand | { kind: 'help' };

export function parseCommand(argv: string[], environment: NodeJS.ProcessEnv): ParsedCommand {
  if (['candidate', 'readiness', 'evidence', 'run'].includes(argv[0] ?? ''))
    return parsePipelineCommand(argv, environment);
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        project: { type: 'string', short: 'p' },
        run: { type: 'string', short: 'r' },
        candidate: { type: 'string' },
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

  const candidateId = parsed.values.candidate;
  if (candidateId !== undefined && (typeof candidateId !== 'string' || !isUuid(candidateId)))
    throw new CliInputError('--candidate must be a UUID');
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
    candidateId,
    apiUrl,
    token,
    idempotencyKey,
    json: parsed.values.json === true,
    failOnUnmatched: parsed.values['fail-on-unmatched'] === true,
  };
}
