import { Inject, Injectable } from '@nestjs/common';
import type {
  ReleaseCandidate,
  ReleaseCandidateListQuery,
  ReleaseState as PublicReleaseState,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { Prisma } from '../../../generated/prisma/client';
import { candidateCreatedEvent } from '../../application/events/release-integration-event';
import type { NormalizedCandidateIdentity } from '../../domain/models/release-candidate-identity';
import { appendReleaseIntegrationEvent } from '../persistence/release-event.persistence';
import { toReleaseCandidate } from '../persistence/release.mapper';
import type { IdempotentCreateResult, ProjectResult } from './release.repository.types';

const CANDIDATE_SELECTION = {
  id: true,
  sequence: true,
  sourceRevision: true,
  buildIdentifier: true,
  artifactDigest: true,
  branch: true,
  version: true,
  sourceUrl: true,
  createdAt: true,
  testRuns: {
    orderBy: [{ createdAt: 'asc' as const }, { testRunId: 'asc' as const }],
    select: {
      role: true,
      createdAt: true,
      testRun: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.ReleaseCandidateSelect;

export type CandidateListResult =
  | ProjectResult<{ items: ReleaseCandidate[]; nextCursor: string | null }>
  | { kind: 'release_not_found' };

export type CreateCandidateResult =
  | IdempotentCreateResult<ReleaseCandidate>
  | { kind: 'release_not_found' }
  | { kind: 'release_finalized' }
  | { kind: 'candidate_identity_conflict' };

@Injectable()
export class ReleaseCandidateRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
    query: ReleaseCandidateListQuery,
  ): Promise<CandidateListResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const release = await transaction.release.findFirst({
        where: { id: releaseId, projectId: project.id },
        select: { id: true },
      });
      if (!release) return { kind: 'release_not_found' };
      const records = await transaction.releaseCandidate.findMany({
        where: { releaseId },
        cursor: query.cursor
          ? { organizationId_id: { organizationId, id: query.cursor } }
          : undefined,
        skip: query.cursor ? 1 : undefined,
        take: query.limit + 1,
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        select: CANDIDATE_SELECTION,
      });
      const hasNext = records.length > query.limit;
      const page = hasNext ? records.slice(0, query.limit) : records;
      return {
        kind: 'found',
        value: {
          items: page.map(toReleaseCandidate),
          nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async create(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    input: NormalizedCandidateIdentity,
  ): Promise<CreateCandidateResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
          select: { id: true },
        });
        if (!project) return { kind: 'project_not_found' };
        const releases = await transaction.$queryRaw<
          Array<{ id: string; state: PublicReleaseState }>
        >`
          SELECT id, state FROM releases
          WHERE organization_id = ${organizationId}::uuid
            AND project_id = ${project.id}::uuid
            AND id = ${releaseId}::uuid
          FOR UPDATE
        `;
        const release = releases[0];
        if (!release) return { kind: 'release_not_found' };
        if (release.state !== 'draft' && release.state !== 'active') {
          return { kind: 'release_finalized' };
        }
        const scope = `release:${releaseId}:candidates:create`;
        const claim = await claimIdempotency<ReleaseCandidate>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };
        const duplicate = await transaction.releaseCandidate.findFirst({
          where: { projectId: project.id, identityHash: input.identityHash },
          select: { id: true },
        });
        if (duplicate) return { kind: 'candidate_identity_conflict' };

        const latest = await transaction.releaseCandidate.aggregate({
          where: { releaseId },
          _max: { sequence: true },
        });
        const record = await transaction.releaseCandidate.create({
          data: {
            organizationId,
            projectId: project.id,
            releaseId,
            createdById: actorId,
            sequence: (latest._max.sequence ?? 0) + 1,
            ...input,
          },
          select: CANDIDATE_SELECTION,
        });
        const value = toReleaseCandidate(record);
        await appendReleaseIntegrationEvent(
          transaction,
          candidateCreatedEvent(
            { organizationId, actorId, occurredAt: record.createdAt },
            {
              id: record.id,
              projectId: project.id,
              releaseId,
              sequence: record.sequence,
              identityHash: input.identityHash,
              sourceRevision: input.sourceRevision ?? null,
              buildIdentifier: input.buildIdentifier ?? null,
              artifactDigest: input.artifactDigest ?? null,
            },
          ),
        );
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'release_candidate.created',
          targetType: 'release_candidate',
          targetId: record.id,
          metadata: {
            projectId: project.id,
            releaseId,
            sequence: record.sequence,
            identityHash: input.identityHash,
          },
        });
        await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
        return { kind: 'created', value };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'candidate_identity_conflict' };
      }
      throw error;
    }
  }
}
