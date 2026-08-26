import type { TestRunStatus } from '@caselog/schemas';

export type TestRunReference = {
  id: string;
  projectId: string;
  name: string;
  status: TestRunStatus;
};
