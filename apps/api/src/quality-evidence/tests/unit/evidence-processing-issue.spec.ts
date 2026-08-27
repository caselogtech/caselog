import { describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { evidenceProcessingIssueCode } from '../../domain/models/evidence-processing-issue';

describe('evidence processing issue classification', () => {
  it('keeps expected source failures specific without exposing internal errors', () => {
    expect(evidenceProcessingIssueCode(new ResourceNotFoundError('test_run'))).toBe(
      'test_run_unavailable',
    );
    expect(
      evidenceProcessingIssueCode(new Error('Candidate test run belongs to another project')),
    ).toBe('invalid_source_data');
    expect(evidenceProcessingIssueCode(new Error('database password was rejected'))).toBe(
      'native_materialization_failed',
    );
  });
});
