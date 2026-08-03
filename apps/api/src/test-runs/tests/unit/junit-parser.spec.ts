import { describe, expect, it } from 'vitest';
import {
  JUnitParseError,
  parseJUnitResults,
  type JUnitParserOptions,
  type ParsedJUnitResult,
} from '../../domain/parsers/junit-parser';

describe('JUnit parser', () => {
  it('normalizes common passed, failed, skipped, and error results', async () => {
    const results = await parse(
      `
      <?xml version="1.0" encoding="UTF-8"?>
      <testsuites name="CI">
        <testsuite name="pytest">
          <testcase
            classname="tests.test_auth.TestLogin"
            name="test_valid_login"
            file="tests/test_auth.py"
            time="0.125"
          >
            <properties>
              <property name="caselog.automation_id" value="tests/test_auth.py::test_valid_login" />
              <property name="caselog.case_number">42</property>
            </properties>
          </testcase>
          <testcase classname="com.example.LoginTest" name="rejectsInvalidPassword" time="1.5">
            <failure message="Expected 401" type="AssertionError"><![CDATA[
              expected: 401
              actual: 200
            ]]></failure>
            <system-out>request completed</system-out>
            <system-err>assertion failed</system-err>
          </testcase>
          <testcase classname="auth" name="locks account">
            <skipped message="Not supported on Windows" />
          </testcase>
          <testcase automation_id="auth.network-error" name="reports network errors">
            <error message="Connection reset" type="NetworkError">socket closed</error>
          </testcase>
        </testsuite>
      </testsuites>
    `.trim(),
    );

    expect(results).toEqual([
      {
        sequence: 1,
        name: 'test_valid_login',
        className: 'tests.test_auth.TestLogin',
        file: 'tests/test_auth.py',
        automationId: 'tests/test_auth.py::test_valid_login',
        caseNumber: '42',
        status: 'passed',
        durationMs: 125,
        message: null,
        type: null,
        details: null,
        stdout: null,
        stderr: null,
        truncated: false,
      },
      expect.objectContaining({
        sequence: 2,
        automationId: 'com.example.LoginTest.rejectsInvalidPassword',
        status: 'failed',
        durationMs: 1_500,
        message: 'Expected 401',
        type: 'AssertionError',
        details: expect.stringContaining('actual: 200'),
        stdout: 'request completed',
        stderr: 'assertion failed',
        truncated: false,
      }),
      expect.objectContaining({
        sequence: 3,
        automationId: 'auth.locks account',
        status: 'skipped',
        message: 'Not supported on Windows',
      }),
      expect.objectContaining({
        sequence: 4,
        automationId: 'auth.network-error',
        status: 'error',
        message: 'Connection reset',
        type: 'NetworkError',
        details: 'socket closed',
      }),
    ]);
  });

  it('handles XML and UTF-8 boundaries without buffering the full document', async () => {
    const xml =
      '<j:testsuite xmlns:j="urn:junit"><j:testcase classname="пошук" name="знаходить 🔎"><j:system-out>готово ✅</j:system-out></j:testcase></j:testsuite>';
    const bytes = Buffer.from(xml);
    const chunks = [...bytes].map((_, index) => bytes.subarray(index, index + 1));

    await expect(parse(chunks)).resolves.toEqual([
      expect.objectContaining({
        automationId: 'пошук.знаходить 🔎',
        stdout: 'готово ✅',
        status: 'passed',
      }),
    ]);
  });

  it('yields completed results before consuming the rest of the input', async () => {
    let consumedChunks = 0;
    async function* streamingDocument(): AsyncGenerator<string> {
      consumedChunks += 1;
      yield '<testsuite><testcase name="first"/>';
      consumedChunks += 1;
      yield '<testcase name="second"/></testsuite>';
    }

    const parser = parseJUnitResults(streamingDocument());
    await expect(parser.next()).resolves.toMatchObject({
      done: false,
      value: { sequence: 1, automationId: 'first' },
    });
    expect(consumedChunks).toBe(1);
    await expect(parser.next()).resolves.toMatchObject({
      done: false,
      value: { sequence: 2, automationId: 'second' },
    });
    await expect(parser.next()).resolves.toEqual({ done: true, value: undefined });
    expect(consumedChunks).toBe(2);
  });

  it('bounds diagnostic fields and reports truncation', async () => {
    const [result] = await parse(
      '<testsuite><testcase name="bounded"><failure message="message-too-long">details-too-long</failure><system-out>output-too-long</system-out></testcase></testsuite>',
      { maxTextLength: 7 },
    );

    expect(result).toMatchObject({
      message: 'message',
      details: 'details',
      stdout: 'output-',
      truncated: true,
    });
  });

  it('enforces document and result limits', async () => {
    const xml = '<testsuite><testcase name="one"/><testcase name="two"/></testsuite>';

    await expect(parse(xml, { maxBytes: Buffer.byteLength(xml) - 1 })).rejects.toMatchObject({
      code: 'limit_exceeded',
    });
    await expect(parse(xml, { maxTestCases: 1 })).rejects.toMatchObject({
      code: 'limit_exceeded',
    });
  });

  it('rejects invalid UTF-8 input', async () => {
    await expect(parse([Uint8Array.from([0xff])])).rejects.toMatchObject({
      code: 'malformed_xml',
    });
  });

  it.each([
    ['rejects malformed XML', '<testsuite><testcase name="broken"></testsuite>', 'malformed_xml'],
    ['rejects unsafe doctypes', '<!DOCTYPE testsuite><testsuite/>', 'unsafe_xml'],
    ['rejects unsupported roots', '<report/>', 'unsupported_root'],
    ['requires a test name', '<testsuite><testcase/></testsuite>', 'invalid_testcase'],
    [
      'requires a non-negative duration',
      '<testsuite><testcase name="invalid" time="-1"/></testsuite>',
      'invalid_testcase',
    ],
    [
      'rejects durations outside the database integer range',
      '<testsuite><testcase name="invalid" time="2147483.648"/></testsuite>',
      'invalid_testcase',
    ],
    [
      'validates explicit case numbers',
      '<testsuite><testcase name="invalid" case_number="CASE-1"/></testsuite>',
      'invalid_testcase',
    ],
  ])('%s', async (_name, xml, code) => {
    await expect(parse(xml)).rejects.toMatchObject({ code });
  });

  it('validates parser options before consuming input', async () => {
    const error = await parse('<testsuite/>', { maxBytes: 0 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(JUnitParseError);
  });
});

async function parse(
  input: string | Array<Uint8Array | string>,
  options?: JUnitParserOptions,
): Promise<ParsedJUnitResult[]> {
  const results: ParsedJUnitResult[] = [];
  for await (const result of parseJUnitResults(chunks(input), options)) results.push(result);
  return results;
}

async function* chunks(
  input: string | Array<Uint8Array | string>,
): AsyncGenerator<Uint8Array | string> {
  yield* typeof input === 'string' ? [input] : input;
}
