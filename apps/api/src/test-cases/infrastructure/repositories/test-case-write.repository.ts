import { testCasePrioritySchema } from '@caselog/schemas';
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTestCaseRequest,
  CreateTestCaseResponse,
  UpdateTestCaseRequest,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import {
  CREATE_TEMPLATE_MAP,
  type CreateTestCaseResult,
  type UpdateTestCaseResult,
} from '../persistence/test-case.persistence';

export type CaseWriteIdentity = { idempotencyKey?: string; apiTokenId?: string };

@Injectable()
export class TestCaseWriteRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    projectSlug: string,
    request: CreateTestCaseRequest,
    identity: CaseWriteIdentity,
  ): Promise<CreateTestCaseResult | { kind: 'idempotency_conflict' }> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const scope = `project:${project.id}:actor:${userId}:cases:create`;
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const key = identity.idempotencyKey;
      if (key) {
        const previous = await findIdempotency<CreateTestCaseResponse>(
          transaction,
          organizationId,
          scope,
          key,
          requestHash,
        );
        if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (previous?.kind === 'replay') return { kind: 'created', value: previous.value };
      }

      const section = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, suiteId: true, name: true },
      });
      if (!section) {
        return { kind: 'section_not_found' };
      }

      if (key) {
        const claim = await claimIdempotency<CreateTestCaseResponse>(
          transaction,
          organizationId,
          scope,
          key,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'created', value: claim.value };
      }

      const numberedProject = await transaction.project.update({
        where: { organizationId_id: { organizationId, id: project.id } },
        data: { nextCaseNumber: { increment: 1 } },
        select: { nextCaseNumber: true },
      });
      const testCase = await transaction.testCase.create({
        data: {
          organizationId,
          projectId: project.id,
          suiteId: section.suiteId,
          sectionId: section.id,
          caseNumber: numberedProject.nextCaseNumber - 1n,
          automationId: request.automationId,
        },
        select: { id: true, caseNumber: true },
      });
      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
          title: request.title,
          template: CREATE_TEMPLATE_MAP[request.template],
          priority: request.priority ?? 'medium',
          preconditions: request.preconditions,
          expectedResult: request.expectedResult,
          content: request.content,
          createdById: userId,
        },
        select: { id: true, version: true },
      });
      const current = await transaction.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: { currentVersionId: version.id },
        select: { updatedAt: true },
      });

      const value: CreateTestCaseResponse = {
        testCase: {
          id: testCase.id,
          caseNumber: testCase.caseNumber.toString(),
          title: request.title,
          priority: request.priority ?? 'medium',
          template: request.template,
          automationId: request.automationId ?? null,
          section: { id: section.id, name: section.name },
          updatedAt: current.updatedAt.toISOString(),
        },
        version: { id: version.id, version: 1 },
      };
      await appendAuditLog(transaction, {
        organizationId,
        actorId: identity.apiTokenId ?? userId,
        actorType: identity.apiTokenId ? 'api_token' : 'user',
        action: 'test_case.created',
        targetType: 'test_case',
        targetId: testCase.id,
        metadata: { projectId: project.id, createdById: userId, version: 1 },
      });
      if (key) await storeIdempotencyResponse(transaction, organizationId, scope, key, value);
      return { kind: 'created', value };
    });
  }

  async update(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    request: UpdateTestCaseRequest,
    identity: CaseWriteIdentity,
  ): Promise<UpdateTestCaseResult | { kind: 'idempotency_conflict' }> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM test_cases
        WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${project.id}::uuid
          AND id = ${caseId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: 'case_not_found' };
      }

      const scope = `project:${project.id}:actor:${userId}:case:${caseId}:update`;
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const key = identity.idempotencyKey;
      if (key) {
        const previous = await findIdempotency<UpdateTestCaseResponse>(
          transaction,
          organizationId,
          scope,
          key,
          requestHash,
        );
        if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (previous?.kind === 'replay') return { kind: 'updated', value: previous.value };
      }

      const testCase = await transaction.testCase.findUnique({
        where: { organizationId_id: { organizationId, id: caseId } },
        select: {
          id: true,
          caseNumber: true,
          currentVersion: { select: { version: true, priority: true } },
        },
      });
      if (!testCase?.currentVersion) {
        return { kind: 'case_not_found' };
      }
      if (testCase.currentVersion.version !== request.baseVersion) {
        return {
          kind: 'version_conflict',
          currentVersion: testCase.currentVersion.version,
        };
      }

      const section = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, suiteId: true, name: true },
      });
      if (!section) {
        return { kind: 'section_not_found' };
      }

      if (key) {
        const claim = await claimIdempotency<UpdateTestCaseResponse>(
          transaction,
          organizationId,
          scope,
          key,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'updated', value: claim.value };
      }

      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: request.baseVersion + 1,
          priority: request.priority ?? testCase.currentVersion.priority,
          title: request.title,
          template: CREATE_TEMPLATE_MAP[request.template],
          preconditions: request.preconditions,
          expectedResult: request.expectedResult,
          content: request.content,
          createdById: userId,
        },
        select: { id: true, version: true },
      });
      const current = await transaction.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: {
          suiteId: section.suiteId,
          sectionId: section.id,
          automationId: request.automationId ?? null,
          currentVersionId: version.id,
        },
        select: { id: true, automationId: true, updatedAt: true },
      });

      const value: UpdateTestCaseResponse = {
        testCase: {
          id: current.id,
          caseNumber: testCase.caseNumber.toString(),
          title: request.title,
          priority: testCasePrioritySchema.parse(
            request.priority ?? testCase.currentVersion.priority,
          ),
          template: request.template,
          automationId: current.automationId,
          section: { id: section.id, name: section.name },
          updatedAt: current.updatedAt.toISOString(),
        },
        version,
      };
      await appendAuditLog(transaction, {
        organizationId,
        actorId: identity.apiTokenId ?? userId,
        actorType: identity.apiTokenId ? 'api_token' : 'user',
        action: 'test_case.updated',
        targetType: 'test_case',
        targetId: caseId,
        metadata: { projectId: project.id, createdById: userId, version: version.version },
      });
      if (key) await storeIdempotencyResponse(transaction, organizationId, scope, key, value);
      return { kind: 'updated', value };
    });
  }
}
