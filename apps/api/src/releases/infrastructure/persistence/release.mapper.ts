import type {
  CandidateTestRun,
  EnvironmentState,
  EnvironmentSettingsSummary,
  EnvironmentSummary,
  ReleaseCandidate,
  ReleaseState,
  ReleaseSummary,
  TestRunStatus,
} from '@caselog/schemas';
import type {
  CandidateTestRunRole,
  EnvironmentState as DatabaseEnvironmentState,
  ReleaseState as DatabaseReleaseState,
  RunStatus,
} from '../../../generated/prisma/enums';

export const ENVIRONMENT_STATE: Record<DatabaseEnvironmentState, EnvironmentState> = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
};

export const RELEASE_STATE: Record<DatabaseReleaseState, ReleaseState> = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  RELEASED: 'released',
  CANCELLED: 'cancelled',
};

export const RUN_STATUS: Record<RunStatus, TestRunStatus> = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

export const LINK_ROLE: Record<CandidateTestRunRole, CandidateTestRun['role']> = {
  REQUIRED: 'required',
  INFORMATIONAL: 'informational',
};

type EnvironmentRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  state: DatabaseEnvironmentState;
  createdAt: Date;
  updatedAt: Date;
};

export function toEnvironmentSummary(record: EnvironmentRecord): EnvironmentSummary {
  return {
    ...record,
    state: ENVIRONMENT_STATE[record.state],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toEnvironmentSettingsSummary(
  record: EnvironmentRecord & { _count: { releases: number } },
): EnvironmentSettingsSummary {
  return {
    ...toEnvironmentSummary(record),
    activeReleaseCount: record._count.releases,
  };
}

type ReleaseRecord = {
  id: string;
  key: string;
  name: string;
  state: DatabaseReleaseState;
  targetDate: Date | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  environment: {
    id: string;
    name: string;
    slug: string;
    state: DatabaseEnvironmentState;
  } | null;
  _count: { candidates: number };
};

export function toReleaseSummary(record: ReleaseRecord): ReleaseSummary {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    state: RELEASE_STATE[record.state],
    environment: record.environment
      ? { ...record.environment, state: ENVIRONMENT_STATE[record.environment.state] }
      : null,
    targetDate: record.targetDate?.toISOString() ?? null,
    externalReference: record.externalReference,
    candidateCount: record._count.candidates,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    activatedAt: record.activatedAt?.toISOString() ?? null,
    releasedAt: record.releasedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}

type CandidateRecord = {
  id: string;
  sequence: number;
  sourceRevision: string | null;
  buildIdentifier: string | null;
  artifactDigest: string | null;
  branch: string | null;
  version: string | null;
  sourceUrl: string | null;
  createdAt: Date;
  testRuns: Array<{
    role: CandidateTestRunRole;
    createdAt: Date;
    testRun: { id: string; name: string; status: RunStatus };
  }>;
};

export function toReleaseCandidate(record: CandidateRecord): ReleaseCandidate {
  return {
    id: record.id,
    sequence: record.sequence,
    label: `RC-${record.sequence}`,
    sourceRevision: record.sourceRevision,
    buildIdentifier: record.buildIdentifier,
    artifactDigest: record.artifactDigest,
    branch: record.branch,
    version: record.version,
    sourceUrl: record.sourceUrl,
    createdAt: record.createdAt.toISOString(),
    testRuns: record.testRuns.map(({ role, createdAt, testRun }) => ({
      testRunId: testRun.id,
      name: testRun.name,
      status: RUN_STATUS[testRun.status],
      role: LINK_ROLE[role],
      linkedAt: createdAt.toISOString(),
    })),
  };
}
