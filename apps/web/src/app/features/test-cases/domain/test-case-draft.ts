import type { CreateTestCaseRequest } from '@caselog/schemas';

interface TestCaseDraftContent {
  template: CreateTestCaseRequest['template'];
  steps: Array<{ action: string; expected: string }>;
  text: string;
  charter: string;
  gherkin: string;
}

export function testCaseDraftContent(
  draft: TestCaseDraftContent,
): CreateTestCaseRequest['content'] {
  switch (draft.template) {
    case 'steps':
      return {
        steps: draft.steps.map((step) => ({
          action: step.action,
          expected: step.expected || undefined,
        })),
      };
    case 'text':
      return { text: draft.text };
    case 'exploratory':
      return { charter: draft.charter };
    case 'bdd':
      return { gherkin: draft.gherkin };
  }
}
