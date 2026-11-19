import type {
  CreateTestCaseResponse,
  TestCaseDetailResponse,
  TestCaseListResponse,
  TestCaseLifecycleResponse,
  TestCaseTemplate,
  TestCaseVersion,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { CaseTemplate } from '../../../generated/prisma/enums';

export const TEMPLATE_MAP: Record<CaseTemplate, TestCaseTemplate> = {
  STEPS: 'steps',
  TEXT: 'text',
  EXPLORATORY: 'exploratory',
  BDD: 'bdd',
};

export const CREATE_TEMPLATE_MAP: Record<TestCaseTemplate, CaseTemplate> = {
  steps: CaseTemplate.STEPS,
  text: CaseTemplate.TEXT,
  exploratory: CaseTemplate.EXPLORATORY,
  bdd: CaseTemplate.BDD,
};

type TestCasePage = Omit<TestCaseListResponse, 'project'>;

export type TestCaseListResult =
  | { kind: 'found'; project: TestCaseListResponse['project']; page: TestCasePage }
  | { kind: 'project_not_found' };

export type CreateTestCaseResult =
  | { kind: 'created'; value: CreateTestCaseResponse }
  | { kind: 'project_not_found' }
  | { kind: 'section_not_found' };

export type DuplicateTestCaseResult = CreateTestCaseResult | { kind: 'case_not_found' };

export type TestCaseDetailResult =
  | { kind: 'found'; value: TestCaseDetailResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' };

export type UpdateTestCaseResult =
  | { kind: 'updated'; value: UpdateTestCaseResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' }
  | { kind: 'section_not_found' }
  | { kind: 'version_not_found' }
  | { kind: 'version_conflict'; currentVersion: number };

export type TestCaseVersionResult =
  | { kind: 'found'; value: TestCaseVersion }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' }
  | { kind: 'version_not_found' };

export type TestCaseLifecycleResult =
  | { kind: 'found'; value: TestCaseLifecycleResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' };
