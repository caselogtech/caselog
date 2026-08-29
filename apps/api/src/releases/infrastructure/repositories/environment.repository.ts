import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateEnvironmentRequest,
  EnvironmentLifecycleResponse,
  EnvironmentSettingsSummary,
  EnvironmentState as PublicEnvironmentState,
  EnvironmentSummary,
  UpdateEnvironmentRequest,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { EnvironmentState, Prisma, ReleaseState } from '../../../generated/prisma/client';
import {
  environmentCreatedEvent,
  environmentStateChangedEvent,
  environmentUpdatedEvent,
} from '../../application/events/release-integration-event';
import { appendReleaseIntegrationEvent } from '../persistence/release-event.persistence';
import { toEnvironmentSettingsSummary, toEnvironmentSummary } from '../persistence/release.mapper';
import type { IdempotentCreateResult, ProjectResult } from './release.repository.types';

export type CreateEnvironmentResult =
  | IdempotentCreateResult<EnvironmentSummary>
  | { kind: 'slug_conflict' };

export type EnvironmentLifecycleResult =
  | ProjectResult<EnvironmentLifecycleResponse>
  | { kind: 'environment_not_found' }
  | { kind: 'open_releases' };

export type UpdateEnvironmentResult =
  | ProjectResult<EnvironmentSettingsSummary>
  | { kind: 'environment_not_found' }
  | { kind: 'slug_conflict' };

const ENVIRONMENT_SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      releases: {
        where: { state: { in: [ReleaseState.DRAFT, ReleaseState.ACTIVE] } },
      },
    },
  },
} satisfies Prisma.EnvironmentSelect;

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
        select: ENVIRONMENT_SETTINGS_SELECT,
      });
      return { kind: 'found', value: records.map(toEnvironmentSettingsSummary) };
    });
  }

  async update(
    organizationId: string,
    projectSlug: string,
    environmentId: string,
    actorId: string,
    request: UpdateEnvironmentRequest,
  ): Promise<UpdateEnvironmentResult> {
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

        const records = await transaction.$queryRaw<
          Array<{ id: string; name: string; slug: string; description: string | null }>
        >`
          SELECT id, name, slug, description
          FROM environments
          WHERE organization_id = ${organizationId}::uuid
            AND project_id = ${projectId}::uuid
            AND id = ${environmentId}::uuid
          FOR UPDATE
        `;
        const current = records[0];
        if (!current) return { kind: 'environment_not_found' };

        const changedFields = [
          ...(current.name !== request.name ? ['name'] : []),
          ...(current.slug !== request.slug ? ['slug'] : []),
          ...(current.description !== request.description ? ['description'] : []),
        ];
        const environment =
          changedFields.length === 0
            ? await transaction.environment.findUniqueOrThrow({
                where: { organizationId_id: { organizationId, id: environmentId } },
                select: ENVIRONMENT_SETTINGS_SELECT,
              })
            : await transaction.environment.update({
                where: { organizationId_id: { organizationId, id: environmentId } },
                data: request,
                select: ENVIRONMENT_SETTINGS_SELECT,
              });

        if (changedFields.length > 0) {
          await appendReleaseIntegrationEvent(
            transaction,
            environmentUpdatedEvent(
              { organizationId, actorId, occurredAt: environment.updatedAt },
              {
                id: environment.id,
                projectId,
                name: environment.name,
                slug: environment.slug,
                description: environment.description,
                changedFields,
                sourceRevision: environment.updatedAt.toISOString(),
              },
            ),
          );
          await appendAuditLog(transaction, {
            organizationId,
            actorId,
            actorType: 'user',
            action: 'environment.updated',
            targetType: 'environment',
            targetId: environment.id,
            metadata: { projectId, changedFields },
          });
        }
        return { kind: 'found', value: toEnvironmentSettingsSummary(environment) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'slug_conflict' };
      }
      throw error;
    }
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
        await appendReleaseIntegrationEvent(
          transaction,
          environmentCreatedEvent(
            { organizationId, actorId, occurredAt: record.createdAt },
            {
              id: record.id,
              projectId,
              name: record.name,
              slug: record.slug,
              createdAt: record.createdAt,
            },
          ),
        );
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
      const updated = await transaction.environment.update({
        where: { organizationId_id: { organizationId, id: environmentId } },
        data: { state: target },
        select: { updatedAt: true },
      });
      await appendReleaseIntegrationEvent(
        transaction,
        environmentStateChangedEvent(
          { organizationId, actorId, occurredAt: updated.updatedAt },
          {
            environmentId,
            projectId: projects.id,
            fromState: environment.state,
            toState: publicTarget,
            sourceRevision: randomUUID(),
          },
        ),
      );
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
