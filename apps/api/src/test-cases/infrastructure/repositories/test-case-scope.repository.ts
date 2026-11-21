import { Inject, Injectable } from '@nestjs/common';
import { testCasePrioritySchema } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { TestCaseScopeItem } from '../../application/ports/test-case-scope';

@Injectable()
export class TestCaseScopeRepository {
  constructor(@Inject(TenantDatabaseService) private readonly database: TenantDatabaseService) {}
  capture(organizationId: string, projectId: string): Promise<TestCaseScopeItem[]> {
    return this.database.run(organizationId, async (transaction) => {
      const records = await transaction.testCase.findMany({
        where: {
          organizationId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
          section: { deletedAt: null },
          suite: { deletedAt: null },
          currentVersionId: { not: null },
        },
        orderBy: { id: 'asc' },
        take: 20_001,
        select: { id: true, currentVersion: { select: { id: true, priority: true } } },
      });
      if (records.length > 20_000) throw new Error('Candidate test scope exceeds 20000 cases');
      return records.flatMap((record) =>
        record.currentVersion
          ? [
              {
                caseId: record.id,
                versionId: record.currentVersion.id,
                priority: testCasePrioritySchema.parse(record.currentVersion.priority),
              },
            ]
          : [],
      );
    });
  }
}
