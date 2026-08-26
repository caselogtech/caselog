import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateEnvironmentRequest,
  EnvironmentLifecycleResponse,
  EnvironmentState as PublicEnvironmentState,
  EnvironmentSummary,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { EnvironmentState, Prisma, ReleaseState } from '../../../generated/prisma/client';
import { toEnvironmentSummary } from '../persistence/release.mapper';
import type { IdempotentCreateResult, ProjectResult } from './release.repository.types';

export type CreateEnvironmentResult =
  | IdempotentCreateResult<EnvironmentSummary>
  | { kind: 'slug_conflict' };

export type EnvironmentLifecycleResult =
  | ProjectResult<EnvironmentLifecycleResponse>
  | { kind: 'environment_not_found' }
  | { kind: 'open_releases' };

@Injectable()
export class EnvironmentRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(organizationId: string, projectSlug: string): Promise<ProjectResult<EnvironmentSummary[]>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const records = await transaction.environment.findMany({
        where: { projectId: project.id },
        orderBy: [{ state: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return { kind: 'found', value: records.map(toEnvironmentSummary) };
    });
  }

  async create(
    organizationId: string,
    projectSlug: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    request: CreateEnvironmentRequest,
  ): Promise<CreateEnvironmentResult> {
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
        const scope = `project:${projectId}:environments:create`;
        const claim = await claimIdempotency<EnvironmentSummary>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };

        const record = await transaction.environment.create({
          data: { organizationId, projectId, createdById: actorId, ...request },
        });
        const value = toEnvironmentSummary(record);
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: 'environment.created',
          targetType: 'environment',
          targetId: record.id,
          metadata: { projectId, slug: record.slug },
        });
        await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, value);
        return { kind: 'created', value };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'slug_conflict' };
      }
      throw error;
    }
  }

  archive(
    organizationId: string,
    projectSlug: string,
    environmentId: string,
    actorId: string,
  ): Promise<EnvironmentLifecycleResult> {
    return this.changeState(organizationId, projectSlug, environmentId, actorId, 'archive');
  }

  restore(
    organizationId: string,
    projectSlug: string,
    environmentId: string,
    actorId: string,
  ): Promise<EnvironmentLifecycleResult> {
    return this.changeState(organizationId, projectSlug, environmentId, actorId, 'restore');
  }

  private changeState(
    organizationId: string,
    projectSlug: string,
    environmentId: string,
    actorId: string,
    operation: 'archive' | 'restore',
  ): Promise<EnvironmentLifecycleResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const projects = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!projects) return { kind: 'project_not_found' };
      const records = await transaction.$queryRaw<
        Array<{ id: string; state: PublicEnvironmentState }>
      >`
        SELECT id, state FROM environments
        WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${projects.id}::uuid
          AND id = ${environmentId}::uuid
        FOR UPDATE
      `;
      const environment = records[0];
      if (!environment) return { kind: 'environment_not_found' };
      const target = operation === 'archive' ? EnvironmentState.ARCHIVED : EnvironmentState.ACTIVE;
      const publicTarget = operation === 'archive' ? 'archived' : 'active';
      if (environment.state === publicTarget) {
        return {
          kind: 'found',
          value: { environmentId, state: publicTarget },
        };
      }
      if (operation === 'archive') {
        const openReleases = await transaction.release.count({
          where: {
            projectId: projects.id,
            environmentId,
            state: { in: [ReleaseState.DRAFT, ReleaseState.ACTIVE] },
          },
        });
        if (openReleases > 0) return { kind: 'open_releases' };
      }
      await transaction.environment.update({
        where: { organizationId_id: { organizationId, id: environmentId } },
        data: { state: target },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: `environment.${operation}d`,
        targetType: 'environment',
        targetId: environmentId,
        metadata: { projectId: projects.id },
      });
      return {
        kind: 'found',
        value: { environmentId, state: publicTarget },
      };
    });
  }
}
