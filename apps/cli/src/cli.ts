#!/usr/bin/env node

import { CliInputError, parseCommand } from './arguments.js';
import { UploadError, uploadJUnit, type UploadSummary } from './upload.js';

const HELP = `Caselog CLI

Usage:
  caselog upload --project <slug> --run <uuid> [options] <file-or-directory>

Options:
  -p, --project <slug>       Project slug
  -r, --run <uuid>           Test run ID
  -f, --format junit         Result format (currently JUnit only)
      --api-url <url>        API base URL (default: CASELOG_API_URL or localhost)
      --idempotency-key <k>  Custom retry key
      --json                 Print a machine-readable summary
      --fail-on-unmatched    Exit with code 2 when results cannot be matched
  -h, --help                 Show this help

Environment:
  CASELOG_TOKEN              Org-scoped API token with results:write
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

    const summary = await uploadJUnit(command);
    io.stdout(command.json ? JSON.stringify(summary) : humanSummary(summary));
    return command.failOnUnmatched && summary.unmatched > 0 ? 2 : 0;
  } catch (error) {
    if (error instanceof CliInputError) {
      io.stderr(`Error: ${error.message}\n\n${HELP}`);
      return 1;
    }
    if (error instanceof UploadError) {
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
