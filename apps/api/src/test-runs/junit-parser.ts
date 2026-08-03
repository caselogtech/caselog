import { Buffer } from 'node:buffer';
import { SaxesParser, type SaxesTagPlain } from 'saxes';

const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
const DEFAULT_MAX_TEST_CASES = 100_000;
const DEFAULT_MAX_TEXT_LENGTH = 50_000;

export type JUnitResultStatus = 'passed' | 'failed' | 'error' | 'skipped';

export type ParsedJUnitResult = {
  sequence: number;
  name: string;
  className: string | null;
  file: string | null;
  automationId: string;
  caseNumber: string | null;
  status: JUnitResultStatus;
  durationMs: number | null;
  message: string | null;
  type: string | null;
  details: string | null;
  stdout: string | null;
  stderr: string | null;
  truncated: boolean;
};

export type JUnitParserOptions = {
  maxBytes?: number;
  maxTestCases?: number;
  maxTextLength?: number;
};

export type JUnitParseErrorCode =
  | 'malformed_xml'
  | 'unsafe_xml'
  | 'unsupported_root'
  | 'invalid_testcase'
  | 'limit_exceeded';

export class JUnitParseError extends Error {
  constructor(
    readonly code: JUnitParseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'JUnitParseError';
  }
}

type PendingResult = {
  name: string;
  className: string | null;
  file: string | null;
  automationId: string | null;
  caseNumber: string | null;
  status: JUnitResultStatus;
  durationMs: number | null;
  message: string | null;
  type: string | null;
  details: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
};

type CapturedElement = {
  name: 'failure' | 'error' | 'skipped' | 'system-out' | 'system-err';
  depth: number;
};

type CapturedProperty = {
  kind: 'automationId' | 'caseNumber';
  depth: number;
  value: string;
};

export async function* parseJUnitResults(
  input: AsyncIterable<Uint8Array | string>,
  options: JUnitParserOptions = {},
): AsyncGenerator<ParsedJUnitResult> {
  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const maxTestCases = positiveLimit(options.maxTestCases, DEFAULT_MAX_TEST_CASES, 'maxTestCases');
  const maxTextLength = positiveLimit(
    options.maxTextLength,
    DEFAULT_MAX_TEXT_LENGTH,
    'maxTextLength',
  );
  const completed: ParsedJUnitResult[] = [];
  const elementStack: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let byteCount = 0;
  let resultCount = 0;
  let root: string | null = null;
  let currentResult: PendingResult | null = null;
  let capturedElement: CapturedElement | null = null;
  let capturedProperty: CapturedProperty | null = null;

  const parser = new SaxesParser({ xmlns: false });

  parser.on('error', (error) => {
    throw new JUnitParseError('malformed_xml', `Invalid JUnit XML: ${error.message}`, {
      cause: error,
    });
  });
  parser.on('doctype', () => {
    throw new JUnitParseError('unsafe_xml', 'JUnit XML documents must not contain a DOCTYPE');
  });
  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    elementStack.push(name);
    if (!root) {
      root = name;
      if (!['testsuite', 'testsuites'].includes(root)) {
        throw new JUnitParseError(
          'unsupported_root',
          'JUnit XML root must be <testsuite> or <testsuites>',
        );
      }
    }

    if (name === 'testcase') {
      if (currentResult) {
        throw new JUnitParseError('invalid_testcase', 'JUnit test cases must not be nested');
      }
      currentResult = createPendingResult(tag);
      return;
    }
    if (!currentResult) return;

    if (isCapturedElement(name)) {
      if (name === 'error') currentResult.status = 'error';
      if (name === 'failure' && currentResult.status !== 'error') currentResult.status = 'failed';
      if (name === 'skipped' && !['error', 'failed'].includes(currentResult.status)) {
        currentResult.status = 'skipped';
      }
      if (['error', 'failure', 'skipped'].includes(name)) {
        for (const field of ['message', 'type'] as const) {
          const value = attribute(tag, field);
          if (currentResult[field] === null && value !== undefined) {
            const appended = appendLimited('', value, maxTextLength);
            currentResult[field] = appended.value;
            currentResult.truncated ||= appended.truncated;
          }
        }
      }
      capturedElement ??= { name, depth: elementStack.length };
      return;
    }

    if (name === 'property') {
      const kind = propertyKind(attribute(tag, 'name'));
      if (kind) {
        capturedProperty = {
          kind,
          depth: elementStack.length,
          value: attribute(tag, 'value') ?? '',
        };
      }
    }
  });
  parser.on('text', (text) => appendCapturedText(text));
  parser.on('cdata', (text) => appendCapturedText(text));
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    const depth = elementStack.length;

    if (capturedProperty?.depth === depth && name === 'property') {
      applyProperty(currentResult, capturedProperty);
      capturedProperty = null;
    }
    if (capturedElement?.depth === depth && capturedElement.name === name) {
      capturedElement = null;
    }
    if (name === 'testcase') {
      if (!currentResult) {
        throw new JUnitParseError('invalid_testcase', 'JUnit test case closed without opening');
      }
      resultCount += 1;
      if (resultCount > maxTestCases) {
        throw new JUnitParseError(
          'limit_exceeded',
          `JUnit XML exceeds the limit of ${maxTestCases} test cases`,
        );
      }
      completed.push(finalizeResult(currentResult, resultCount));
      currentResult = null;
      capturedElement = null;
      capturedProperty = null;
    }
    elementStack.pop();
  });

  function appendCapturedText(text: string): void {
    if (!currentResult) return;
    if (capturedProperty) {
      const appended = appendLimited(capturedProperty.value, text, 501);
      capturedProperty.value = appended.value;
      return;
    }
    if (!capturedElement) return;

    const field = capturedField(capturedElement.name);
    const appended = appendLimited(currentResult[field], text, maxTextLength);
    currentResult[field] = appended.value;
    currentResult.truncated ||= appended.truncated;
  }

  function parseChunk(chunk: string): void {
    if (chunk.length > 0) parser.write(chunk);
  }

  try {
    for await (const chunk of input) {
      byteCount += typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.byteLength;
      if (byteCount > maxBytes) {
        throw new JUnitParseError(
          'limit_exceeded',
          `JUnit XML exceeds the limit of ${maxBytes} bytes`,
        );
      }
      parseChunk(
        typeof chunk === 'string'
          ? decoder.decode() + chunk
          : decoder.decode(chunk, {
              stream: true,
            }),
      );
      yield* drain(completed);
    }
    parseChunk(decoder.decode());
    parser.close();
    yield* drain(completed);
  } catch (error) {
    if (error instanceof JUnitParseError) throw error;
    if (error instanceof TypeError && error.message.includes('encoded data was not valid')) {
      throw new JUnitParseError('malformed_xml', 'JUnit XML must be valid UTF-8', { cause: error });
    }
    throw error;
  }
}

function createPendingResult(tag: SaxesTagPlain): PendingResult {
  const name = attribute(tag, 'name')?.trim();
  if (!name) throw new JUnitParseError('invalid_testcase', 'JUnit test case name is required');
  const className = attribute(tag, 'classname')?.trim() || null;
  return {
    name,
    className,
    file: attribute(tag, 'file')?.trim() || null,
    automationId:
      firstAttribute(tag, ['automation_id', 'automationId', 'caselog_automation_id'])?.trim() ||
      null,
    caseNumber:
      firstAttribute(tag, ['case_number', 'caseNumber', 'caselog_case_number'])?.trim() || null,
    status: 'passed',
    durationMs: parseDuration(attribute(tag, 'time')),
    message: null,
    type: null,
    details: '',
    stdout: '',
    stderr: '',
    truncated: false,
  };
}

function finalizeResult(result: PendingResult, sequence: number): ParsedJUnitResult {
  const automationId =
    result.automationId ?? (result.className ? `${result.className}.${result.name}` : result.name);
  if (automationId.length > 500) {
    throw new JUnitParseError('invalid_testcase', 'JUnit automation ID exceeds 500 characters');
  }
  if (result.caseNumber && !/^[1-9]\d*$/.test(result.caseNumber)) {
    throw new JUnitParseError('invalid_testcase', 'JUnit case number must be a positive integer');
  }
  return {
    sequence,
    name: result.name,
    className: result.className,
    file: result.file,
    automationId,
    caseNumber: result.caseNumber,
    status: result.status,
    durationMs: result.durationMs,
    message: normalizedText(result.message),
    type: normalizedText(result.type),
    details: normalizedText(result.details),
    stdout: normalizedText(result.stdout),
    stderr: normalizedText(result.stderr),
    truncated: result.truncated,
  };
}

function parseDuration(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new JUnitParseError('invalid_testcase', 'JUnit test case time must be non-negative');
  }
  const milliseconds = Math.round(seconds * 1_000);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new JUnitParseError('invalid_testcase', 'JUnit test case time is too large');
  }
  return milliseconds;
}

function applyProperty(result: PendingResult | null, property: CapturedProperty): void {
  if (!result) return;
  const value = property.value.trim();
  if (!value) return;
  result[property.kind] = value;
}

function propertyKind(value: string | undefined): CapturedProperty['kind'] | null {
  const normalized = value?.trim().toLowerCase();
  if (['automation_id', 'automationid', 'caselog.automation_id'].includes(normalized ?? '')) {
    return 'automationId';
  }
  if (['case_number', 'casenumber', 'caselog.case_number'].includes(normalized ?? '')) {
    return 'caseNumber';
  }
  return null;
}

function capturedField(name: CapturedElement['name']): 'details' | 'stdout' | 'stderr' {
  if (name === 'system-out') return 'stdout';
  if (name === 'system-err') return 'stderr';
  return 'details';
}

function isCapturedElement(name: string): name is CapturedElement['name'] {
  return ['failure', 'error', 'skipped', 'system-out', 'system-err'].includes(name);
}

function attribute(tag: SaxesTagPlain, name: string): string | undefined {
  return tag.attributes[name];
}

function firstAttribute(tag: SaxesTagPlain, names: string[]): string | undefined {
  for (const name of names) {
    const value = attribute(tag, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name;
}

function normalizedText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function appendLimited(
  current: string,
  addition: string,
  limit: number,
): { value: string; truncated: boolean } {
  const remaining = Math.max(0, limit - current.length);
  return {
    value: current + addition.slice(0, remaining),
    truncated: addition.length > remaining,
  };
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function* drain(results: ParsedJUnitResult[]): Generator<ParsedJUnitResult> {
  yield* results;
  results.length = 0;
}
