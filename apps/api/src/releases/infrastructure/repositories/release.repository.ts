import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReleaseRequest,
  ReleaseDetailResponse,
  ReleaseLifecycleResponse,
  ReleaseListQuery,
  ReleaseListResponse,
  ReleaseState as PublicReleaseState,
  ReleaseSummary,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { EnvironmentState, Prisma, ReleaseState } from '../../../generated/prisma/client';
import {
  releaseCreatedEvent,
  releaseStateChangedEvent,
} from '../../application/events/release-integration-event';
import { canTransitionRelease } from '../../domain/policies/release-lifecycle.policy';
import { appendReleaseIntegrationEvent } from '../persistence/release-event.persistence';
import { RELEASE_STATE, toReleaseCandidate, toReleaseSummary } from '../persistence/release.mapper';
import type { IdempotentCreateResult, ProjectResult } from './release.repository.types';

const STATE: Record<PublicReleaseState, ReleaseState> = {
  draft: ReleaseState.DRAFT,
  active: ReleaseState.ACTIVE,
  released: ReleaseState.RELEASED,
  cancelled: ReleaseState.CANCELLED,
};

const TRANSITION_AUDIT_ACTION: Record<Exclude<PublicReleaseState, 'draft'>, string> = {
  active: 'release.activated',
  released: 'release.released',
  cancelled: 'release.cancelled',
};

const RELEASE_SELECTION = {
  id: true,
  key: true,
  name: true,
  state: true,
  targetDate: true,
  externalReference: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
  releasedAt: true,
  cancelledAt: true,
  environment: { select: { id: true, name: true, slug: true, state: true } },
  _count: { select: { candidates: true } },
} satisfies Prisma.ReleaseSelect;

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

export type CreateReleaseResult =
  | IdempotentCreateResult<ReleaseSummary>
  | { kind: 'environment_not_found' }
  | { kind: 'environment_archived' }
  | { kind: 'key_conflict' };

export type ReleaseDetailResult =
  | ProjectResult<ReleaseDetailResponse>
  | { kind: 'release_not_found' };

export type ReleaseTransitionResult =
  | ProjectResult<ReleaseLifecycleResponse>
  | { kind: 'release_not_found' }
  | { kind: 'invalid_transition'; from: PublicReleaseState; to: PublicReleaseState };

@Injectable()
export class ReleaseRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    query: ReleaseListQuery,
  ): Promise<ProjectResult<ReleaseListResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const records = await transaction.release.findMany({
        where: { projectId: project.id, state: query.state ? STATE[query.state] : undefined },
        cursor: query.cursor
          ? { organizationId_id: { organizationId, id: query.cursor } }
          : undefined,
        skip: query.cursor ? 1 : undefined,
        take: query.limit + 1,
        orderBy: { id: 'asc' },
        select: RELEASE_SELECTION,
      });
      const hasNext = records.length > query.limit;
      const page = hasNext ? records.slice(0, query.limit) : records;
      return {
        kind: 'found',
        value: {
          items: page.map(toReleaseSummary),
          nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async create(
    organizationId: string,
    projectSlug: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    request: CreateReleaseRequest,
  ): Promise<CreateReleaseResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const projects = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM projects
          WHERE organization_id = ${organizationId}::uuid
            AND slug = ${projectSlug}
            AND deleted_at IS NULL
          FOR SHARE
        `;
        const projectId = projects[0]?.id;
        if (!projectId) return { kind: 'project_not_found' };
        const scope = `project:${projectId}:releases:create`;
        const claim = await claimIdempotency<ReleaseSummary>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };

        if (request.environmentId) {
          const environment = await transaction.environment.findUnique({
            where: { organizationId_id: { organizationId, id: request.environmentId } },
            select: { projectId: true, state: true },
          });
          if (!environment || environment.projectId !== projectId) {
            return { kind: 'environment_not_found' };
          }
          if (environment.state === EnvironmentState.ARCHIVED) {
            return { kind: 'environment_archived' };
          }
        }

        const record = await transaction.release.create({
          data: {
            organizationId,
            projectId,
            createdById: actorId,
            key: request.key,
            name: request.name,
            environmentId: request.environmentId,
            targetDate: request.targetDate ? new Date(request.targetDate) : undefined,
            externalReference: request.externalReference,
          },
          select: RELEASE_SELECTION,
        });
        const value = toReleaseSummary(record);
        const lifecycleEvent = await transaction.releaseLifecycleEvent.create({
          data: {
            organizationId,
            projectId,
            releaseId: record.id,
            actorId,
            toState: ReleaseState.DRAFT,
          },
        });
        await appendReleaseIntegrationEvent(
          transaction,
          releaseCreatedEvent(
            { organizationId, actorId, occurredAt: lifecycleEvent.occurredAt },
            {
              id: record.id,
              projectId,
              environmentId: request.environmentId ?? null,
              key: record.key,
              name: record.name,
              sourceRevision: lifecycleEvent.id,
            },
          ),
        );
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'release.created',
          targetType: 'release',
          targetId: record.id,
          metadata: { projectId, key: record.key, environmentId: request.environmentId ?? null },
        });
        await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
        return { kind: 'created', value };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'key_conflict' };
      }
      throw error;
    }
  }

  detail(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
  ): Promise<ReleaseDetailResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const record = await transaction.release.findFirst({
        where: { id: releaseId, projectId: project.id },
        select: {
          ...RELEASE_SELECTION,
          candidates: { orderBy: { sequence: 'asc' }, select: CANDIDATE_SELECTION },
          lifecycleEvents: {
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: { id: true, fromState: true, toState: true, occurredAt: true },
          },
        },
      });
      if (!record) return { kind: 'release_not_found' };
      return {
        kind: 'found',
        value: {
          release: toReleaseSummary(record),
          candidates: record.candidates.map(toReleaseCandidate),
          history: record.lifecycleEvents.map((event) => ({
            id: event.id,
            fromState: event.fromState ? RELEASE_STATE[event.fromState] : null,
            toState: RELEASE_STATE[event.toState],
            occurredAt: event.occurredAt.toISOString(),
          })),
        },
      };
    });
  }

  transition(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
    actorId: string,
    target: Exclude<PublicReleaseState, 'draft'>,
  ): Promise<ReleaseTransitionResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const records = await transaction.$queryRaw<
        Array<{ id: string; state: PublicReleaseState; updatedAt: Date }>
      >`
        SELECT id, state, updated_at AS "updatedAt" FROM releases
        WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${project.id}::uuid
          AND id = ${releaseId}::uuid
        FOR UPDATE
      `;
      const release = records[0];
      if (!release) return { kind: 'release_not_found' };
      const from = release.state;
      if (!canTransitionRelease(from, target)) {
        return { kind: 'invalid_transition', from, to: target };
      }
      if (from === target) {
        return {
          kind: 'found',
          value: { releaseId, state: target, updatedAt: release.updatedAt.toISOString() },
        };
      }

      const now = new Date();
      const updated = await transaction.release.update({
        where: { organizationId_id: { organizationId, id: releaseId } },
        data: {
          state: STATE[target],
          activatedAt: target === 'active' ? now : undefined,
          releasedAt: target === 'released' ? now : undefined,
          cancelledAt: target === 'cancelled' ? now : undefined,
        },
        select: { updatedAt: true },
      });
      const lifecycleEvent = await transaction.releaseLifecycleEvent.create({
        data: {
          organizationId,
          projectId: project.id,
          releaseId,
          fromState: STATE[from],
          toState: STATE[target],
          actorId,
          occurredAt: now,
        },
      });
      await appendReleaseIntegrationEvent(
        transaction,
        releaseStateChangedEvent(
          { organizationId, actorId, occurredAt: now },
          {
            releaseId,
            projectId: project.id,
            fromState: from,
            toState: target,
            sourceRevision: lifecycleEvent.id,
          },
        ),
      );
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: TRANSITION_AUDIT_ACTION[target],
        targetType: 'release',
        targetId: releaseId,
        metadata: { projectId: project.id, fromState: from, toState: target },
      });
      return {
        kind: 'found',
        value: { releaseId, state: target, updatedAt: updated.updatedAt.toISOString() },
      };
    });
  }
}
