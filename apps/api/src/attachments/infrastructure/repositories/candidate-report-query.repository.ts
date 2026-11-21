import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { CandidateReportContext } from '../../application/ports/candidate-report';
import {
  candidateReportSelect,
  toCandidateReport,
} from '../persistence/candidate-report.persistence';
@Injectable()
export class CandidateReportQueryRepository {
  constructor(@Inject(TenantDatabaseService) private readonly database: TenantDatabaseService) {}
  findMany(context: CandidateReportContext, ids: string[]) {
    return this.database.run(context.organizationId, async (transaction) => {
      const records = await transaction.attachment.findMany({
        where: {
          organizationId: context.organizationId,
          targetType: 'CANDIDATE_REPORT',
          targetId: context.candidateId,
          id: { in: ids },
          deletedAt: null,
        },
        select: candidateReportSelect,
      });
      return records.map(toCandidateReport);
    });
  }
  download(context: CandidateReportContext, id: string) {
    return this.database.run(context.organizationId, (transaction) =>
      transaction.attachment.findFirst({
        where: {
          organizationId: context.organizationId,
          targetType: 'CANDIDATE_REPORT',
          targetId: context.candidateId,
          id,
          deletedAt: null,
        },
        select: { fileName: true, contentType: true, blob: { select: { storageKey: true } } },
      }),
    );
  }
}
