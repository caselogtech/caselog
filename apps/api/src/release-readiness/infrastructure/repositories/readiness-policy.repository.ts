import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReadinessPolicyRequest,
  CreateReadinessPolicyVersionRequest,
  ReadinessPolicyListQuery,
  ReadinessPolicyListResponse,
  ReadinessPolicyResponse,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { Prisma, ReleasePolicyVersionState } from '../../../generated/prisma/client';
import {
  READINESS_POLICY_SELECTION,
  READINESS_POLICY_SUMMARY_SELECTION,
  readinessGateData,
  toReadinessPolicyResponse,
  toReadinessPolicySummary,
} from '../persistence/readiness-policy.persistence';

export type ReadinessPolicyWriteResult =
  | { kind: 'found'; value: ReadinessPolicyResponse }
  | {
      kind:
        | 'project_not_found'
        | 'policy_not_found'
        | 'policy_key_conflict'
        | 'draft_exists'
        | 'draft_not_found'
        | 'draft_changed'
        | 'idempotency_conflict';
    };

export type ReadinessPolicyDetailResult =
  | { kind: 'found'; value: ReadinessPolicyResponse }
  | { kind: 'project_not_found' | 'policy_not_found' };

export type ReadinessPolicyListResult =
  | { kind: 'found'; value: ReadinessPolicyListResponse }
  | { kind: 'project_not_found' | 'cursor_not_found' };

@Injectable()
export class ReadinessPolicyRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    query: ReadinessPolicyListQuery,
  ): Promise<ReadinessPolicyListResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const cursor = query.cursor
        ? await transaction.releasePolicy.findFirst({
            where: { projectId: project.id, id: query.cursor },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'cursor_not_found' };
      const records = await transaction.releasePolicy.findMany({
        where: {
          projectId: project.id,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: READINESS_POLICY_SUMMARY_SELECTION,
      });
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);
      return {
        kind: 'found',
        value: {
          items: page.map(toReadinessPolicySummary),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
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
    request: CreateReadinessPolicyRequest,
  ): Promise<ReadinessPolicyWriteResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
          select: { id: true },
        });
        if (!project) return { kind: 'project_not_found' };
        const scope = `project:${project.id}:release-policies:create`;
        const claim = await claimIdempotency<ReadinessPolicyResponse>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

        const policy = await transaction.releasePolicy.create({
          data: {
            organizationId,
            projectId: project.id,
            key: request.key,
            name: request.name,
            description: request.description,
            createdById: actorId,
          },
          select: { id: true },
        });
        const version = await transaction.releasePolicyVersion.create({
          data: {
            organizationId,
            projectId: project.id,
            policyId: policy.id,
            version: 1,
            createdById: actorId,
          },
          select: { id: true },
        });
        await transaction.readinessGate.createMany({
          data: request.gates.map((gate, position) =>
            readinessGateData({
              organizationId,
              projectId: project.id,
              policyVersionId: version.id,
              gate,
              position,
            }),
          ),
        });
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'release_policy.created',
          targetType: 'release_policy',
          targetId: policy.id,
          metadata: {
            projectId: project.id,
            key: request.key,
            version: 1,
            gateCount: request.gates.length,
          },
        });
        const value = await policyResponse(transaction, organizationId, project.id, policy.id);
        await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
        return { kind: 'found', value };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'policy_key_conflict' };
      }
      throw error;
    }
  }

  detail(
    organizationId: string,
    projectSlug: string,
    policyId: string,
  ): Promise<ReadinessPolicyDetailResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const policy = await transaction.releasePolicy.findFirst({
        where: { id: policyId, projectId: project.id },
        select: READINESS_POLICY_SELECTION,
      });
      return policy
        ? { kind: 'found', value: toReadinessPolicyResponse(policy) }
        : { kind: 'policy_not_found' };
    });
  }

  async createVersion(
    organizationId: string,
    projectSlug: string,
    policyId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    request: CreateReadinessPolicyVersionRequest,
  ): Promise<ReadinessPolicyWriteResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const context = await lockPolicy(transaction, organizationId, projectSlug, policyId);
        if (context.kind !== 'found') return context;
        const scope = `release-policy:${policyId}:versions:create`;
        const previous = await findIdempotency<ReadinessPolicyResponse>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };

        const versions = await transaction.releasePolicyVersion.findMany({
          where: { policyId },
          select: { version: true, state: true },
          orderBy: { version: 'desc' },
        });
        if (versions.some(({ state }) => state === ReleasePolicyVersionState.DRAFT)) {
          return { kind: 'draft_exists' };
        }
        const claim = await claimIdempotency<ReadinessPolicyResponse>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'found', value: claim.value };
        const versionNumber = (versions[0]?.version ?? 0) + 1;
        const version = await transaction.releasePolicyVersion.create({
          data: {
            organizationId,
            projectId: context.projectId,
            policyId,
            version: versionNumber,
            createdById: actorId,
          },
          select: { id: true },
        });
        await transaction.readinessGate.createMany({
          data: request.gates.map((gate, position) =>
            readinessGateData({
              organizationId,
              projectId: context.projectId,
              policyVersionId: version.id,
              gate,
              position,
            }),
          ),
        });
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'release_policy.version_created',
          targetType: 'release_policy_version',
          targetId: version.id,
          metadata: {
            projectId: context.projectId,
            policyId,
            version: versionNumber,
            gateCount: request.gates.length,
          },
        });
        const value = await policyResponse(
          transaction,
          organizationId,
          context.projectId,
          policyId,
        );
        await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
        return { kind: 'found', value };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'draft_exists' };
      }
      throw error;
    }
  }

  async publish(
    organizationId: string,
    projectSlug: string,
    policyId: string,
    expectedDraftId: string | null,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<ReadinessPolicyWriteResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await lockPolicy(transaction, organizationId, projectSlug, policyId);
      if (context.kind !== 'found') return context;
      const scope = `release-policy:${policyId}:publish`;
      const previous = await findIdempotency<ReadinessPolicyResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };

      const draft = await transaction.releasePolicyVersion.findFirst({
        where: { policyId, state: ReleasePolicyVersionState.DRAFT },
        select: { id: true, version: true },
      });
      if (!draft) return { kind: 'draft_not_found' };
      if (draft.id !== expectedDraftId) return { kind: 'draft_changed' };
      const claim = await claimIdempotency<ReadinessPolicyResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };
      const publishedAt = new Date();
      await transaction.releasePolicyVersion.updateMany({
        where: { policyId, state: ReleasePolicyVersionState.PUBLISHED },
        data: { state: ReleasePolicyVersionState.RETIRED, retiredAt: publishedAt },
      });
      await transaction.releasePolicyVersion.update({
        where: { organizationId_id: { organizationId, id: draft.id } },
        data: {
          state: ReleasePolicyVersionState.PUBLISHED,
          publishedAt,
          publishedById: actorId,
        },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: 'release_policy.published',
        targetType: 'release_policy_version',
        targetId: draft.id,
        metadata: { projectId: context.projectId, policyId, version: draft.version },
      });
      const value = await policyResponse(transaction, organizationId, context.projectId, policyId);
      await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
      return { kind: 'found', value };
    });
  }
}

async function lockPolicy(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  policyId: string,
): Promise<
  { kind: 'found'; projectId: string } | { kind: 'project_not_found' | 'policy_not_found' }
> {
  const projects = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM projects
    WHERE organization_id = ${organizationId}::uuid
      AND slug = ${projectSlug}
      AND deleted_at IS NULL
    FOR SHARE
  `;
  const projectId = projects[0]?.id;
  if (!projectId) return { kind: 'project_not_found' };
  const policies = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM release_policies
    WHERE organization_id = ${organizationId}::uuid
      AND project_id = ${projectId}::uuid
      AND id = ${policyId}::uuid
    FOR UPDATE
  `;
  return policies[0] ? { kind: 'found', projectId } : { kind: 'policy_not_found' };
}

async function policyResponse(
  transaction: TenantTransaction,
  organizationId: string,
  projectId: string,
  policyId: string,
): Promise<ReadinessPolicyResponse> {
  const policy = await transaction.releasePolicy.findFirstOrThrow({
    where: { organizationId, id: policyId, projectId },
    select: READINESS_POLICY_SELECTION,
  });
  return toReadinessPolicyResponse(policy);
}
