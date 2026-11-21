import type { ReleaseSummary, UpdateReleaseRequest } from '@caselog/schemas';

export type ReleaseEditValues = {
  name: string;
  environmentId: string;
  targetDate: string;
  externalReference: string;
};

export function validReleaseDate(value: string): boolean {
  if (!value) return true;
  const date = new Date(`${value}T12:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function releaseEditRequest(
  values: ReleaseEditValues,
  initial: ReleaseSummary,
): UpdateReleaseRequest {
  return {
    name: values.name.trim(),
    environmentId: values.environmentId || null,
    targetDate:
      values.targetDate === (initial.targetDate?.slice(0, 10) ?? '')
        ? initial.targetDate
        : values.targetDate
          ? `${values.targetDate}T12:00:00.000Z`
          : null,
    externalReference: values.externalReference.trim() || null,
    expectedUpdatedAt: initial.updatedAt,
  };
}
