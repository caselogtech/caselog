import { Inject, Injectable } from '@nestjs/common';
import type { TestRunStatus } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { RunStatus } from '../../../generated/prisma/enums';
import type { TestRunReference } from '../../application/ports/test-run-reference';

const STATUS: Record<RunStatus, TestRunStatus> = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

@Injectable()
export class TestRunReferenceRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunReference | null> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.testRun.findFirst({
        where: {
          organizationId,
          id: runId,
          deletedAt: null,
          project: { slug: projectSlug, deletedAt: null },
        },
        select: { id: true, projectId: true, name: true, status: true },
      }),
    );
    return record ? { ...record, status: STATUS[record.status] } : null;
  }
}
