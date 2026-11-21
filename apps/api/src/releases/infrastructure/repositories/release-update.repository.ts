import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseSummary, UpdateReleaseRequest } from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { releaseUpdatedEvent } from '../../application/events/release-integration-event';
import {
  planReleaseUpdate,
  type ReleaseUpdateSnapshot,
} from '../../domain/policies/release-update.policy';
import { appendReleaseIntegrationEvent } from '../persistence/release-event.persistence';
import { toReleaseSummary } from '../persistence/release.mapper';
import { RELEASE_SELECTION } from '../persistence/release.selection';

export type ReleaseUpdateResult =
  | { kind: 'found'; value: ReleaseSummary }
  | {
      kind:
        | 'project_not_found'
        | 'release_not_found'
        | 'environment_not_found'
        | 'environment_archived'
        | 'finalized'
        | 'stale';
    };

@Injectable()
export class ReleaseUpdateRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  update(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
    actorId: string,
    request: UpdateReleaseRequest,
  ): Promise<ReleaseUpdateResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const projects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects
        WHERE organization_id = ${organizationId}::uuid AND slug = ${projectSlug}
          AND deleted_at IS NULL FOR SHARE
      `;
      const projectId = projects[0]?.id;
      if (!projectId) return { kind: 'project_not_found' };
      const records = await transaction.$queryRaw<
        Array<
          Omit<ReleaseUpdateSnapshot, 'updatedAt' | 'targetDate'> & {
            updatedAt: Date;
            targetDate: Date | null;
          }
        >
      >`
        SELECT name, environment_id AS "environmentId", target_date AS "targetDate",
          external_reference AS "externalReference", state, updated_at AS "updatedAt"
        FROM releases WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${projectId}::uuid AND id = ${releaseId}::uuid FOR UPDATE
      `;
      const current = records[0];
      if (!current) return { kind: 'release_not_found' };
      const plan = planReleaseUpdate(
        {
          ...current,
          targetDate: current.targetDate?.toISOString() ?? null,
          updatedAt: current.updatedAt.toISOString(),
        },
        request,
      );
      if (plan.kind === 'finalized' || plan.kind === 'stale') return plan;
      if (plan.kind === 'unchanged') {
        const record = await transaction.release.findUniqueOrThrow({
          where: { organizationId_id: { organizationId, id: releaseId }, projectId },
          select: RELEASE_SELECTION,
        });
        return { kind: 'found', value: toReleaseSummary(record) };
      }
      if (request.environmentId && request.environmentId !== current.environmentId) {
        // Serialize assignment against environment archival. An unchanged archived
        // environment may remain attached while other release metadata is corrected.
        const environments = await transaction.$queryRaw<Array<{ state: 'active' | 'archived' }>>`
          SELECT state FROM environments WHERE organization_id = ${organizationId}::uuid
            AND project_id = ${projectId}::uuid AND id = ${request.environmentId}::uuid FOR SHARE
        `;
        if (!environments[0]) return { kind: 'environment_not_found' };
        if (environments[0].state === 'archived') return { kind: 'environment_archived' };
      }
      // Millisecond timestamps are the public concurrency token. Advance strictly
      // under the release lock, even for two edits within the same clock tick.
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const record = await transaction.release.update({
        where: { organizationId_id: { organizationId, id: releaseId }, projectId },
        data: {
          name: request.name,
          environmentId: request.environmentId,
          targetDate: request.targetDate,
          externalReference: request.externalReference,
          updatedAt,
        },
        select: RELEASE_SELECTION,
      });
      await appendReleaseIntegrationEvent(
        transaction,
        releaseUpdatedEvent(
          { organizationId, actorId, occurredAt: updatedAt },
          {
            releaseId,
            projectId,
            changedFields: plan.changedFields,
            sourceRevision: updatedAt.toISOString(),
          },
        ),
      );
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: 'release.updated',
        targetType: 'release',
        targetId: releaseId,
        metadata: {
          projectId,
          changedFields: plan.changedFields,
          previousEnvironmentId: current.environmentId,
          environmentId: request.environmentId,
        },
      });
      return { kind: 'found', value: toReleaseSummary(record) };
    });
  }
}
