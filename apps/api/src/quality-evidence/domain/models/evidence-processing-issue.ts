import type { EvidenceProcessingIssueCode } from '@caselog/schemas/evidence';
import { DomainError } from '../../../common/errors/domain.error';

const INVALID_SOURCE_MESSAGES = new Set([
  'Candidate test run belongs to another project',
  'Test run item references an unavailable result status',
]);

export function evidenceProcessingIssueCode(error: unknown): EvidenceProcessingIssueCode {
  if (error instanceof DomainError && error.details.resource === 'test_run') {
    return 'test_run_unavailable';
  }
  if (error instanceof Error && INVALID_SOURCE_MESSAGES.has(error.message)) {
    return 'invalid_source_data';
  }
  return 'native_materialization_failed';
}
