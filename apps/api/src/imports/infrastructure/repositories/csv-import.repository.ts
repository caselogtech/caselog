import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateTestCaseRequest, CsvImportResponse, TestCaseTemplate } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { Prisma } from '../../../generated/prisma/client';
import { CaseTemplate } from '../../../generated/prisma/enums';

const TEMPLATE_MAP: Record<TestCaseTemplate, CaseTemplate> = {
  steps: CaseTemplate.STEPS,
  text: CaseTemplate.TEXT,
  exploratory: CaseTemplate.EXPLORATORY,
  bdd: CaseTemplate.BDD,
};

export type CsvImportResult =
  | { kind: 'imported'; value: CsvImportResponse }
  | { kind: 'replayed'; value: CsvImportResponse }
  | { kind: 'project_not_found' }
  | { kind: 'section_not_found'; sectionIds: string[] }
  | { kind: 'idempotency_conflict' };

@Injectable()
export class CsvImportRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async missingSections(
    organizationId: string,
    projectSlug: string,
    sectionIds: string[],
  ): Promise<{ kind: 'found'; sectionIds: string[] } | { kind: 'project_not_found' }> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const sections = await transaction.section.findMany({
        where: {
          organizationId,
          projectId: project.id,
          id: { in: sectionIds },
          deletedAt: null,
        },
        select: { id: true },
      });
      const existing = new Set(sections.map((section) => section.id));
      return { kind: 'found', sectionIds: sectionIds.filter((id) => !existing.has(id)) };
    });
  }

  async import(
    organizationId: string,
    userId: string,
    projectSlug: string,
    idempotencyKey: string,
    requestHash: string,
    rows: CreateTestCaseRequest[],
  ): Promise<CsvImportResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const sectionIds = [...new Set(rows.map((row) => row.sectionId))];
      const sections = await transaction.section.findMany({
        where: { organizationId, projectId: project.id, id: { in: sectionIds }, deletedAt: null },
        select: { id: true, suiteId: true },
      });
      const sectionById = new Map(sections.map((section) => [section.id, section]));
      const missingSectionIds = sectionIds.filter((sectionId) => !sectionById.has(sectionId));
      if (missingSectionIds.length > 0) {
        return { kind: 'section_not_found', sectionIds: missingSectionIds };
      }

      const scope = `csv-import:${project.id}`;
      const claim = await claimIdempotency<CsvImportResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };

      const numberedProject = await transaction.project.update({
        where: { organizationId_id: { organizationId, id: project.id } },
        data: { nextCaseNumber: { increment: rows.length } },
        select: { nextCaseNumber: true },
      });
      const firstCaseNumber = numberedProject.nextCaseNumber - BigInt(rows.length);
      const records = rows.map((row, index) => {
        const section = sectionById.get(row.sectionId);
        if (!section) throw new Error('Validated CSV section is unavailable');
        return {
          row,
          testCaseId: randomUUID(),
          versionId: randomUUID(),
          caseNumber: firstCaseNumber + BigInt(index),
          suiteId: section.suiteId,
        };
      });

      await transaction.testCase.createMany({
        data: records.map((record) => ({
          organizationId,
          id: record.testCaseId,
          projectId: project.id,
          suiteId: record.suiteId,
          sectionId: record.row.sectionId,
          caseNumber: record.caseNumber,
          automationId: record.row.automationId,
        })),
      });
      await transaction.testCaseVersion.createMany({
        data: records.map((record) => ({
          organizationId,
          id: record.versionId,
          testCaseId: record.testCaseId,
          version: 1,
          title: record.row.title,
          template: TEMPLATE_MAP[record.row.template],
          preconditions: record.row.preconditions,
          expectedResult: record.row.expectedResult,
          content: record.row.content as Prisma.InputJsonValue,
          createdById: userId,
        })),
      });
      const currentVersions = Prisma.join(
        records.map(
          (record) => Prisma.sql`(${record.testCaseId}::uuid, ${record.versionId}::uuid)`,
        ),
      );
      await transaction.$executeRaw`
        UPDATE test_cases AS test_case
        SET current_version_id = versions.version_id,
            updated_at = CURRENT_TIMESTAMP
        FROM (VALUES ${currentVersions}) AS versions(test_case_id, version_id)
        WHERE test_case.organization_id = ${organizationId}::uuid
          AND test_case.project_id = ${project.id}::uuid
          AND test_case.id = versions.test_case_id
      `;

      const response: CsvImportResponse = {
        imported: records.length,
        testCases: records.map((record) => ({
          id: record.testCaseId,
          caseNumber: record.caseNumber.toString(),
          title: record.row.title,
        })),
      };
      await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, response);
      return { kind: 'imported', value: response };
    });
  }
}
