import { auditLogActionSchema } from '@caselog/schemas';

export type AuditMetadataEntry = { key: string; value: string };

export function auditActionFilter(value: string | null): string {
  const parsed = auditLogActionSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : '';
}

export function auditActionLabel(action: string): string {
  const label = action.replaceAll(/[._]+/g, ' ').trim();
  return label ? `${label[0]?.toUpperCase()}${label.slice(1)}` : action;
}

export function auditMetadataEntries(metadata: Record<string, unknown>): AuditMetadataEntry[] {
  return Object.entries(metadata)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value: auditMetadataValue(value) }));
}

function auditMetadataValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}
