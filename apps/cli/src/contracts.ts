export type JUnitUploadUnmatchedResult = {
  sequence: number;
  name: string;
  automationId: string;
  caseNumber: string | null;
  reason: 'not_found' | 'ambiguous';
};

export type JUnitUploadResponse = {
  total: number;
  recorded: number;
  truncated: number;
  counts: { passed: number; failed: number; error: number; skipped: number };
  unmatched: JUnitUploadUnmatchedResult[];
};

export type ApiErrorResponse = {
  error: { code: string; message: string; details: Record<string, unknown> };
};

export function parseJUnitUploadResponse(value: unknown): JUnitUploadResponse | undefined {
  if (!isRecord(value) || !isRecord(value.counts) || !Array.isArray(value.unmatched)) {
    return undefined;
  }
  const counts = value.counts;
  if (
    !isCount(value.total) ||
    !isCount(value.recorded) ||
    !isCount(value.truncated) ||
    !isCount(counts.passed) ||
    !isCount(counts.failed) ||
    !isCount(counts.error) ||
    !isCount(counts.skipped)
  ) {
    return undefined;
  }
  const unmatched = value.unmatched.map(parseUnmatchedResult);
  if (unmatched.some((result) => result === undefined)) return undefined;

  return {
    total: value.total,
    recorded: value.recorded,
    truncated: value.truncated,
    counts: {
      passed: counts.passed,
      failed: counts.failed,
      error: counts.error,
      skipped: counts.skipped,
    },
    unmatched: unmatched as JUnitUploadUnmatchedResult[],
  };
}

export function parseApiError(value: unknown): ApiErrorResponse | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  const { code, message, details } = value.error;
  if (typeof code !== 'string' || !code || typeof message !== 'string' || !message) {
    return undefined;
  }
  return { error: { code, message, details: isRecord(details) ? details : {} } };
}

function parseUnmatchedResult(value: unknown): JUnitUploadUnmatchedResult | undefined {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) <= 0 ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.automationId !== 'string' ||
    !value.automationId ||
    (value.caseNumber !== null && typeof value.caseNumber !== 'string') ||
    !['not_found', 'ambiguous'].includes(value.reason as string)
  ) {
    return undefined;
  }
  return {
    sequence: value.sequence as number,
    name: value.name,
    automationId: value.automationId,
    caseNumber: value.caseNumber as string | null,
    reason: value.reason as JUnitUploadUnmatchedResult['reason'],
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
