import { describe, expect, it, vi } from 'vitest';
import { resolveEvidenceProcessingIssues } from '../../infrastructure/persistence/evidence-processing-issue.persistence';

describe('evidence processing issue persistence', () => {
  it('resolves only active issues for events committed as consumed', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = { evidenceProcessingIssue: { updateMany } };
    const resolvedAt = new Date('2026-08-27T12:00:00.000Z');

    await expect(
      resolveEvidenceProcessingIssues(
        transaction as never,
        '11111111-1111-4111-8111-111111111111',
        ['22222222-2222-4222-8222-222222222222'],
        resolvedAt,
      ),
    ).resolves.toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        sourceEventId: { in: ['22222222-2222-4222-8222-222222222222'] },
        resolvedAt: null,
      },
      data: { resolvedAt },
    });
  });
});
