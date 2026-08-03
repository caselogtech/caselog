import { describe, expect, it } from 'vitest';
import { CliInputError, parseCommand } from './arguments.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('CLI arguments', () => {
  it('parses a JUnit upload from environment-backed configuration', () => {
    const command = parseCommand(
      ['upload', '--project', 'checkout', '--run', RUN_ID, '--json', './results'],
      {
        CASELOG_TOKEN: 'clg_example-token',
        CASELOG_API_URL: 'https://caselog.example/api/v1',
      },
    );

    expect(command).toMatchObject({
      kind: 'upload',
      inputPath: './results',
      projectSlug: 'checkout',
      runId: RUN_ID,
      token: 'clg_example-token',
      json: true,
    });
    if (command.kind === 'upload') {
      expect(command.apiUrl.toString()).toBe('https://caselog.example/api/v1/');
    }
  });

  it('adds /api/v1 to an origin-only API URL', () => {
    const command = parseCommand(
      ['upload', '-p', 'checkout', '-r', RUN_ID, '--api-url', 'http://localhost:3000', 'x.xml'],
      { CASELOG_TOKEN: 'token' },
    );

    expect(command.kind === 'upload' && command.apiUrl.toString()).toBe(
      'http://localhost:3000/api/v1/',
    );
  });

  it('shows help without requiring upload configuration', () => {
    expect(parseCommand(['--help'], {})).toEqual({ kind: 'help' });
  });

  it.each([
    {
      argv: ['upload', '--project', 'checkout', '--run', RUN_ID, 'x.xml'],
      environment: {},
      message: 'CASELOG_TOKEN is required',
    },
    {
      argv: ['upload', '--project', 'checkout', '--run', '42', 'x.xml'],
      environment: { CASELOG_TOKEN: 'token' },
      message: 'Both --project <slug> and --run <uuid> are required and must be valid',
    },
    {
      argv: ['upload', '--project', 'checkout', '--run', RUN_ID, '--format', 'trx', 'x.xml'],
      environment: { CASELOG_TOKEN: 'token' },
      message: 'Only --format junit is currently supported',
    },
  ])('rejects invalid input: $message', ({ argv, environment, message }) => {
    expect(() => parseCommand(argv, environment)).toThrow(new CliInputError(message));
  });
});
