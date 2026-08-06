import { describe, expect, it } from 'vitest';
import {
  buildDefectDescription,
  defaultDefectSummary,
  type DefectDescriptionContext,
} from '../../domain/formatters/defect-description';

describe('Jira defect description', () => {
  const context: DefectDescriptionContext = {
    organizationSlug: 'qa-team',
    projectSlug: 'checkout',
    run: { id: 'run-id', name: 'Release regression', build: 'build-42' },
    itemId: 'item-id',
    result: {
      id: 'result-id',
      attempt: 2,
      comment: 'No confirmation appeared.',
      build: null,
      status: { name: 'Failed' },
      stepResults: [
        {
          position: 0,
          comment: 'Gateway returned 500.',
          status: { name: 'Failed', countsAsFailure: true },
        },
      ],
    },
    testCase: {
      caseNumber: '42',
      title: 'Card checkout completes',
      template: 'steps',
      preconditions: 'An item is in the cart.',
      expectedResult: 'An order confirmation is displayed.',
      content: { steps: [{ action: 'Submit order', expected: 'Confirmation appears' }] },
    },
    attachments: [{ fileName: 'failure.png', stepPosition: 0 }],
  };

  it('formats immutable case and result context with a deep link', () => {
    const description = buildDefectDescription(
      context,
      'https://caselog.example.com',
      'Chrome / staging',
      'Reproduces consistently.',
    );

    expect(defaultDefectSummary(context)).toBe('[Caselog] Card checkout completes — Failed');
    expect(description).toContain('build-42');
    expect(description).toContain('Gateway returned 500.');
    expect(description).toContain('failure.png (step 1)');
    expect(description).toContain(
      'https://caselog.example.com/qa-team/checkout/runs/run-id/items/item-id/results/result-id',
    );
  });
});
