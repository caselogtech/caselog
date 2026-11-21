import type { TestCasePriority } from '@caselog/schemas';

export type TestCaseScopeItem = { caseId: string; versionId: string; priority: TestCasePriority };
