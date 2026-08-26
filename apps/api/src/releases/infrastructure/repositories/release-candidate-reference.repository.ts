import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseCandidateReference } from '../../application/ports/release-candidate-reference';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type {
  CandidateTestRunRole as PrismaCandidateTestRunRole,
  Prisma,
  ReleaseState as PrismaReleaseState,
} from '../../../generated/prisma/client';
import { LINK_ROLE, RELEASE_STATE } from '../persistence/release.mapper';

const REFERENCE_SELECTION = {
  id: true,
  projectId: true,
  releaseId: true,
  sourceRevision: true,
  buildIdentifier: true,
  artifactDigest: true,
  identityHash: true,
  release: { select: { state: true } },
  testRuns: {
    orderBy: [{ createdAt: 'asc' as const }, { testRunId: 'asc' as const }],
    select: { testRunId: true, role: true },
  },
} satisfies Prisma.ReleaseCandidateSelect;

@Injectable()
export class ReleaseCandidateReferenceRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    candidateId: string,
  ): Promise<ReleaseCandidateReference | null> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.releaseCandidate.findUnique({
        where: { organizationId_id: { organizationId, id: candidateId } },
        select: REFERENCE_SELECTION,
      }),
    );
    return record ? toReference(record) : null;
  }

  async findByTestRun(
    organizationId: string,
    testRunId: string,
  ): Promise<ReleaseCandidateReference | null> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.releaseCandidate.findFirst({
        where: { testRuns: { some: { testRunId } } },
        select: REFERENCE_SELECTION,
      }),
    );
    return record ? toReference(record) : null;
  }
}

function toReference(record: {
  id: string;
  projectId: string;
  releaseId: string;
  sourceRevision: string | null;
  buildIdentifier: string | null;
  artifactDigest: string | null;
  identityHash: string;
  release: { state: PrismaReleaseState };
  testRuns: Array<{ testRunId: string; role: PrismaCandidateTestRunRole }>;
}): ReleaseCandidateReference {
  return {
    id: record.id,
    projectId: record.projectId,
    releaseId: record.releaseId,
    releaseState: RELEASE_STATE[record.release.state],
    sourceRevision: record.sourceRevision,
    buildIdentifier: record.buildIdentifier,
    artifactDigest: record.artifactDigest,
    identityHash: record.identityHash,
    testRuns: record.testRuns.map(({ testRunId, role }) => ({
      testRunId,
      role: LINK_ROLE[role],
    })),
  };
}
