import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateSectionRequest,
  CreateSuiteRequest,
  SectionResponse,
  SuiteResponse,
} from '@caselog/schemas';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { appendAuditLog } from '../../../audit/public-api';
import type { StructureResult } from './project-structure.repository';

export type StructureWriteIdentity = { idempotencyKey?: string; apiTokenId?: string };

@Injectable()
export class ProjectStructureCreateRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async createSuite(
    organizationId: string,
    userId: string,
    projectSlug: string,
    request: CreateSuiteRequest,
    identity: StructureWriteIdentity,
  ): Promise<StructureResult<SuiteResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const projectId = await lockProject(transaction, organizationId, projectSlug);
      if (!projectId) return { kind: 'project_not_found' };
      const scope = `project:${projectId}:actor:${userId}:suites:create`;
      const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const key = identity.idempotencyKey;
      if (key) {
        const previous = await findIdempotency<SuiteResponse>(
          transaction,
          organizationId,
          scope,
          key,
          hash,
        );
        if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };
      }
      const duplicate = await transaction.suite.findFirst({
        where: { organizationId, projectId, name: request.name, deletedAt: null },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'suite' };
      if (key) {
        const claim = await claimIdempotency<SuiteResponse>(
          transaction,
          organizationId,
          scope,
          key,
          hash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'found', value: claim.value };
      }
      const aggregate = await transaction.suite.aggregate({
        where: { organizationId, projectId, deletedAt: null },
        _max: { position: true },
      });
      const suite = await transaction.suite.create({
        data: {
          organizationId,
          projectId,
          name: request.name,
          position: (aggregate._max.position ?? -1) + 1,
        },
        select: { id: true, name: true, position: true },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: identity.apiTokenId ?? userId,
        actorType: identity.apiTokenId ? 'api_token' : 'user',
        action: 'suite.created',
        targetType: 'suite',
        targetId: suite.id,
        metadata: { projectId, createdById: userId },
      });
      if (key) await storeIdempotencyResponse(transaction, organizationId, scope, key, suite);
      return { kind: 'found', value: suite };
    });
  }

  async createSection(
    organizationId: string,
    userId: string,
    projectSlug: string,
    suiteId: string,
    request: CreateSectionRequest,
    identity: StructureWriteIdentity,
  ): Promise<StructureResult<SectionResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const projectId = await lockProject(transaction, organizationId, projectSlug);
      if (!projectId) return { kind: 'project_not_found' };
      const scope = `project:${projectId}:actor:${userId}:suite:${suiteId}:sections:create`;
      const hash = createHash('sha256')
        .update(JSON.stringify({ name: request.name, parentId: request.parentId ?? null }))
        .digest('hex');
      const key = identity.idempotencyKey;
      // Replay precedes mutable suite/parent checks: retries return the original snapshot.
      if (key) {
        const previous = await findIdempotency<SectionResponse>(
          transaction,
          organizationId,
          scope,
          key,
          hash,
        );
        if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };
      }
      const suite = await transaction.suite.findUnique({
        where: { organizationId_id: { organizationId, id: suiteId }, projectId, deletedAt: null },
        select: { id: true },
      });
      if (!suite) return { kind: 'suite_not_found' };
      const parent = request.parentId
        ? await transaction.section.findUnique({
            where: {
              organizationId_id: { organizationId, id: request.parentId },
              projectId,
              suiteId,
              deletedAt: null,
            },
            select: { id: true, path: true, depth: true },
          })
        : null;
      if (request.parentId && !parent) return { kind: 'parent_not_found' };
      const duplicate = await transaction.section.findFirst({
        where: {
          organizationId,
          projectId,
          suiteId,
          parentId: parent?.id ?? null,
          name: request.name,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'section' };
      if (key) {
        const claim = await claimIdempotency<SectionResponse>(
          transaction,
          organizationId,
          scope,
          key,
          hash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'found', value: claim.value };
      }
      const aggregate = await transaction.section.aggregate({
        where: {
          organizationId,
          projectId,
          suiteId,
          parentId: parent?.id ?? null,
          deletedAt: null,
        },
        _max: { position: true },
      });
      const id = randomUUID();
      const section = await transaction.section.create({
        data: {
          organizationId,
          id,
          projectId,
          suiteId,
          parentId: parent?.id,
          name: request.name,
          path: `${parent?.path ?? ''}/${id}`,
          depth: (parent?.depth ?? -1) + 1,
          position: (aggregate._max.position ?? -1) + 1,
        },
        select: {
          id: true,
          suiteId: true,
          parentId: true,
          name: true,
          depth: true,
          position: true,
        },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: identity.apiTokenId ?? userId,
        actorType: identity.apiTokenId ? 'api_token' : 'user',
        action: 'section.created',
        targetType: 'section',
        targetId: section.id,
        metadata: { projectId, suiteId, parentId: parent?.id ?? null, createdById: userId },
      });
      if (key) await storeIdempotencyResponse(transaction, organizationId, scope, key, section);
      return { kind: 'found', value: section };
    });
  }
}

async function lockProject(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
): Promise<string | undefined> {
  // Share the project lock with moves/deletions so parent paths stay valid until commit.
  const projects = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM projects
    WHERE organization_id = ${organizationId}::uuid AND slug = ${projectSlug} AND deleted_at IS NULL
    FOR UPDATE
  `;
  return projects[0]?.id;
}
