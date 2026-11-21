import type { TestCasePriority } from '@caselog/schemas';
const LABEL = {
  low: 'workspace.cases.priorities.low',
  medium: 'workspace.cases.priorities.medium',
  high: 'workspace.cases.priorities.high',
  critical: 'workspace.cases.priorities.critical',
} as const;
export const casePriorityLabel = (priority: TestCasePriority) => LABEL[priority];
