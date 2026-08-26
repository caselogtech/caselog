import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidateTestRun,
  CandidateTestRunRole as PublicLinkRole,
  ReleaseState as PublicReleaseState,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import type { TestRunReference } from '../../../test-runs/public-api';
import { CandidateTestRunRole, Prisma } from '../../../generated/prisma/client';
import type { RunStatus } from '../../../generated/prisma/enums';
import { LINK_ROLE, RUN_STATUS } from '../persistence/release.mapper';
import type { ProjectResult } from './release.repository.types';

const LINK_ROLE_INPUT: Record<PublicLinkRole, CandidateTestRunRole> = {
  required: CandidateTestRunRole.REQUIRED,
  informational: CandidateTestRunRole.INFORMATIONAL,
};

const LINK_SELECTION = {
  role: true,
  createdAt: true,
  testRun: { select: { id: true, name: true, status: true } },
} satisfies Prisma.CandidateTestRunSelect;

export type CandidateLinkResult =
  | ProjectResult<CandidateTestRun>
  | { kind: 'candidate_not_found' }
  | { kind: 'release_finalized' }
  | { kind: 'run_already_linked' };

export type CandidateUnlinkResult =
  | ProjectResult<void>
  | { kind: 'candidate_not_found' }
  | { kind: 'release_finalized' };

@Injectable()
export class CandidateTestRunRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<ProjectResult<CandidateTestRun[]> | { kind: 'candidate_not_found' }> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const candidate = await transaction.releaseCandidate.findFirst({
        where: { id: candidateId, projectId: project.id },
        select: { id: true },
      });
      if (!candidate) return { kind: 'candidate_not_found' };
      const links = await transaction.candidateTestRun.findMany({
        where: { candidateId },
        orderBy: [{ createdAt: 'asc' }, { testRunId: 'asc' }],
        select: LINK_SELECTION,
      });
      return { kind: 'found', value: links.map(toCandidateTestRun) };
    });
  }

  link(
    organizationId: string,
    projectSlug: string,
    candidateId: string,
    actorId: string,
    run: TestRunReference,
    role: PublicLinkRole,
  ): Promise<CandidateLinkResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockCandidate(
        transaction,
        organizationId,
        projectSlug,
        candidateId,
      );
      if (context.kind !== 'found') return context;
      if (context.releaseState !== 'draft' && context.releaseState !== 'active') {
        return { kind: 'release_finalized' };
      }
      if (run.projectId !== context.projectId) return { kind: 'project_not_found' };
      const existing = await transaction.candidateTestRun.findUnique({
        where: { organizationId_testRunId: { organizationId, testRunId: run.id } },
        select: { candidateId: true, role: true },
      });
      if (existing && existing.candidateId !== candidateId) return { kind: 'run_already_linked' };

      const databaseRole = LINK_ROLE_INPUT[role];
      const record = existing
        ? await transaction.candidateTestRun.update({
            where: {
              organizationId_candidateId_testRunId: {
                organizationId,
                candidateId,
                testRunId: run.id,
              },
            },
            data: { role: databaseRole },
            select: LINK_SELECTION,
          })
        : await transaction.candidateTestRun.create({
            data: {
              organizationId,
              projectId: context.projectId,
              candidateId,
              testRunId: run.id,
              role: databaseRole,
              createdById: actorId,
            },
            select: LINK_SELECTION,
          });
      if (!existing || existing.role !== databaseRole) {
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: existing
            ? 'release_candidate.test_run_role_updated'
            : 'release_candidate.test_run_linked',
          targetType: 'release_candidate_test_run',
          targetId: `${candidateId}:${run.id}`,
          metadata: { projectId: context.projectId, candidateId, testRunId: run.id, role },
        });
      }
      return { kind: 'found', value: toCandidateTestRun(record) };
    });
  }

  unlink(
    organizationId: string,
    projectSlug: string,
    candidateId: string,
    actorId: string,
    runId: string,
  ): Promise<CandidateUnlinkResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockCandidate(
        transaction,
        organizationId,
        projectSlug,
        candidateId,
      );
      if (context.kind !== 'found') return context;
      if (context.releaseState !== 'draft' && context.releaseState !== 'active') {
        return { kind: 'release_finalized' };
      }
      const deleted = await transaction.candidateTestRun.deleteMany({
        where: { candidateId, testRunId: runId },
      });
      if (deleted.count > 0) {
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'release_candidate.test_run_unlinked',
          targetType: 'release_candidate_test_run',
          targetId: `${candidateId}:${runId}`,
          metadata: { projectId: context.projectId, candidateId, testRunId: runId },
        });
      }
      return { kind: 'found', value: undefined };
    });
  }

  private async lockCandidate(
    transaction: TenantTransaction,
    organizationId: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<
    | { kind: 'found'; projectId: string; releaseState: PublicReleaseState }
    | { kind: 'project_not_found' | 'candidate_not_found' }
  > {
    const project = await transaction.project.findUnique({
      where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
      select: { id: true },
    });
    if (!project) return { kind: 'project_not_found' };
    const records = await transaction.$queryRaw<
      Array<{ projectId: string; releaseState: PublicReleaseState }>
    >`
      SELECT candidate.project_id AS "projectId", release.state AS "releaseState"
      FROM release_candidates AS candidate
      JOIN releases AS release
        ON release.organization_id = candidate.organization_id
       AND release.id = candidate.release_id
      WHERE candidate.organization_id = ${organizationId}::uuid
        AND candidate.project_id = ${project.id}::uuid
        AND candidate.id = ${candidateId}::uuid
      FOR UPDATE OF release
    `;
    const context = records[0];
    return context ? { kind: 'found', ...context } : { kind: 'candidate_not_found' };
  }
}

function toCandidateTestRun(record: {
  role: CandidateTestRunRole;
  createdAt: Date;
  testRun: { id: string; name: string; status: RunStatus };
}): CandidateTestRun {
  return {
    testRunId: record.testRun.id,
    name: record.testRun.name,
    status: RUN_STATUS[record.testRun.status],
    role: LINK_ROLE[record.role],
    linkedAt: record.createdAt.toISOString(),
  };
}
