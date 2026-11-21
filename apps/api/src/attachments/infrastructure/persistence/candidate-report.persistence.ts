import { type CandidateReport, candidateReportSchema } from '@caselog/schemas';
export const candidateReportSelect = {
  id: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  checksumSha256: true,
  createdAt: true,
} as const;
export function toCandidateReport(record: {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  checksumSha256: string;
  createdAt: Date;
}): CandidateReport {
  return candidateReportSchema.parse({
    ...record,
    sizeBytes: Number(record.sizeBytes),
    createdAt: record.createdAt.toISOString(),
  });
}
