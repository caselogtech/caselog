#!/usr/bin/env node

import { CliInputError, parseCommand } from './arguments.js';
import { UploadError, uploadJUnit, type UploadSummary } from './upload.js';
import { runPipeline } from './pipeline.js';
import { humanPipelineResult } from './pipeline-response.js';
import { PipelineError, requestJson } from './pipeline-client.js';

const HELP = `Caselog CLI

Usage:
  caselog upload --project <slug> --run <uuid> [options] <file-or-directory>
  caselog candidate create --project <slug> --release <uuid> --commit <sha> [--build <id>]
  caselog run close --project <slug> --run <uuid>
  caselog candidate link --project <slug> --candidate <uuid> --run <uuid>
  caselog readiness assign --project <slug> --candidate <uuid> --policy <uuid>
  caselog readiness evaluate --project <slug> --candidate <uuid>
  caselog readiness check --project <slug> --candidate <uuid> [--wait --timeout 120]
  caselog evidence upload --project <slug> --candidate <uuid> --file <json>

Options:
  -p, --project <slug>       Project slug
  -r, --run <uuid>           Test run ID
  -f, --format junit         Result format (currently JUnit only)
      --api-url <url>        API base URL (default: CASELOG_API_URL or localhost)
      --idempotency-key <k>  Custom retry key
      --json                 Print a machine-readable summary
      --fail-on-unmatched    Exit with code 2 when results cannot be matched
      --candidate <uuid>     Link the upload's test run to this candidate
      --wait                 Wait for a current, known readiness decision
      --timeout <seconds>    Pipeline deadline (1–3600, default 120)
      --poll-interval <sec>  Poll interval (0.1–60, default 2)
  -h, --help                 Show this help

Environment:
  CASELOG_TOKEN              Org-scoped API token with the command's required scopes
  CASELOG_API_URL            API base URL, for example https://app.example/api/v1
`;

type CliIo = { stdout: (message: string) => void; stderr: (message: string) => void };

export async function runCli(
  argv: string[],
  environment: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  try {
    const command = parseCommand(argv, environment);
    if (command.kind === 'help') {
      io.stdout(HELP);
      return 0;
    }
    if (command.kind === 'pipeline') {
      const result = await runPipeline(command);
      io.stdout(command.json ? JSON.stringify(result) : humanPipelineResult(result));
      return result.exitCode;
    }
    if (command.candidateId) {
      await requestJson({
        apiUrl: command.apiUrl,
        path: `projects/${command.projectSlug}/candidates/${command.candidateId}/test-runs/${command.runId}`,
        method: 'PUT',
        token: command.token,
        body: { role: 'required' },
        signal: AbortSignal.timeout(30_000),
      });
    }

    const summary = await uploadJUnit(command);
    io.stdout(command.json ? JSON.stringify(summary) : humanSummary(summary));
    return command.failOnUnmatched && summary.unmatched > 0 ? 2 : 0;
  } catch (error) {
    if (['candidate', 'readiness', 'evidence', 'run'].includes(argv[0] ?? '')) {
      const code =
        error instanceof PipelineError
          ? error.code
          : error instanceof CliInputError
            ? 'invalid_arguments'
            : 'operation_failed';
      const message =
        error instanceof PipelineError || error instanceof CliInputError
          ? error.message
          : 'Could not complete the operation';
      if (argv.includes('--json'))
        io.stdout(
          JSON.stringify({
            version: 1,
            command: `${argv[0]} ${argv[1] ?? ''}`,
            exitCode: 2,
            error: { code, message },
          }),
        );
      else io.stderr(`Error: ${message}`);
      return 2;
    }
    if (error instanceof CliInputError) {
      io.stderr(`Error: ${error.message}\n\n${HELP}`);
      return 1;
    }
    if (error instanceof UploadError || error instanceof PipelineError) {
      io.stderr(`Error: ${error.message}`);
      return 1;
    }
    io.stderr('Error: An unexpected error occurred');
    return 1;
  }
}

function humanSummary(summary: UploadSummary): string {
  const lines = [
    `Uploaded ${summary.files.length} file(s): ${summary.recorded}/${summary.total} results recorded`,
    `Passed ${summary.counts.passed}, failed ${summary.counts.failed}, errors ${summary.counts.error}, skipped ${summary.counts.skipped}`,
  ];
  if (summary.unmatched > 0) lines.push(`Unmatched results: ${summary.unmatched}`);
  if (summary.truncated > 0) lines.push(`Truncated results: ${summary.truncated}`);
  return lines.join('\n');
}

if (require.main === module) {
  void runCli(process.argv.slice(2), process.env, {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
