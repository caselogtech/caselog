import { parseArgs } from 'node:util';
import { CliInputError, isUuid, parseApiUrl } from './cli-input.js';

export type PipelineCommand = {
  kind: 'pipeline';
  action: string;
  apiUrl: URL;
  token: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT';
  resource: 'candidate' | 'link' | 'assignment' | 'readiness' | 'observation';
  body?: Record<string, unknown>;
  file?: string;
  candidateId?: string;
  idempotencyKey?: string;
  json: boolean;
  wait: boolean;
  timeoutMs: number;
  pollMs: number;
};

export function parsePipelineCommand(
  argv: string[],
  environment: NodeJS.ProcessEnv,
): PipelineCommand | { kind: 'help' } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        project: { type: 'string', short: 'p' },
        candidate: { type: 'string' },
        release: { type: 'string' },
        run: { type: 'string', short: 'r' },
        policy: { type: 'string' },
        role: { type: 'string', default: 'required' },
        commit: { type: 'string' },
        build: { type: 'string' },
        'artifact-digest': { type: 'string' },
        branch: { type: 'string' },
        version: { type: 'string' },
        'source-url': { type: 'string' },
        file: { type: 'string' },
        'api-url': { type: 'string' },
        'idempotency-key': { type: 'string' },
        json: { type: 'boolean' },
        wait: { type: 'boolean' },
        timeout: { type: 'string', default: '120' },
        'poll-interval': { type: 'string', default: '2' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch {
    throw new CliInputError('Invalid pipeline command arguments; use --help');
  }
  if (parsed.values.help) return { kind: 'help' };
  const [group, operation, ...extra] = parsed.positionals;
  const action = `${group} ${operation}`;
  if (
    extra.length ||
    ![
      'candidate create',
      'candidate link',
      'readiness assign',
      'readiness evaluate',
      'readiness check',
      'evidence upload',
    ].includes(action)
  )
    throw new CliInputError('Unknown pipeline command; use --help');
  const option = (name: string) =>
    typeof parsed.values[name] === 'string' ? parsed.values[name].trim() : undefined;
  const uuid = (name: string) => {
    const value = option(name);
    if (!value || !isUuid(value)) throw new CliInputError(`--${name} must be a UUID`);
    return value;
  };
  const project = option('project');
  if (!project || project.length > 50 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project))
    throw new CliInputError('--project must be a valid slug');
  const token = environment.CASELOG_TOKEN?.trim();
  if (!token) throw new CliInputError('CASELOG_TOKEN is required');
  const timeoutMs = seconds(option('timeout'), 1, 3600, 'timeout');
  const pollMs = seconds(option('poll-interval'), 0.1, 60, 'poll-interval');
  const idempotencyKey = option('idempotency-key');
  if (idempotencyKey !== undefined && (!idempotencyKey || idempotencyKey.length > 200))
    throw new CliInputError('--idempotency-key must contain between 1 and 200 characters');
  const common = {
    kind: 'pipeline' as const,
    action,
    apiUrl: parseApiUrl(option('api-url') ?? environment.CASELOG_API_URL),
    token,
    json: parsed.values.json === true,
    wait: parsed.values.wait === true,
    timeoutMs,
    pollMs,
    idempotencyKey,
  };
  const projectPath = `projects/${project}`;
  if (action === 'candidate create') {
    const body: Record<string, unknown> = {};
    for (const [flag, field] of Object.entries({
      commit: 'sourceRevision',
      build: 'buildIdentifier',
      'artifact-digest': 'artifactDigest',
      branch: 'branch',
      version: 'version',
      'source-url': 'sourceUrl',
    })) {
      const value = option(flag);
      if (value !== undefined) {
        if (
          !value ||
          value.length > (flag === 'source-url' ? 2048 : flag === 'version' ? 120 : 255)
        )
          throw new CliInputError(`Invalid --${flag}`);
        body[field] = value;
      }
    }
    if (!body.sourceRevision && !body.buildIdentifier && !body.artifactDigest)
      throw new CliInputError('Candidate requires --commit, --build, or --artifact-digest');
    return {
      ...common,
      path: `${projectPath}/releases/${uuid('release')}/candidates`,
      method: 'POST',
      resource: 'candidate',
      body,
    };
  }
  const candidateId = uuid('candidate');
  const candidatePath = `${projectPath}/candidates/${candidateId}`;
  if (action === 'candidate link') {
    const role = option('role');
    if (role !== 'required' && role !== 'informational')
      throw new CliInputError('--role must be required or informational');
    return {
      ...common,
      candidateId,
      path: `${candidatePath}/test-runs/${uuid('run')}`,
      method: 'PUT',
      resource: 'link',
      body: { role },
    };
  }
  if (action === 'readiness assign')
    return {
      ...common,
      candidateId,
      path: `${candidatePath}/readiness-policy`,
      method: 'PUT',
      resource: 'assignment',
      body: { policyId: uuid('policy') },
    };
  if (action === 'evidence upload') {
    const file = option('file');
    if (!file) throw new CliInputError('Evidence upload requires --file <json>');
    return {
      ...common,
      candidateId,
      path: `${projectPath}/evidence`,
      method: 'POST',
      resource: 'observation',
      file,
    };
  }
  return {
    ...common,
    candidateId,
    path: `${candidatePath}/readiness${action === 'readiness evaluate' ? '/evaluations' : ''}`,
    method: action === 'readiness evaluate' ? 'POST' : 'GET',
    resource: 'readiness',
  };
}

function seconds(value: string | undefined, min: number, max: number, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max)
    throw new CliInputError(`--${name} must be between ${min} and ${max} seconds`);
  return Math.ceil(number * 1000);
}
