import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../core/crypto/crypto.module';
import {
  ISSUE_TRACKER_PROVIDERS,
  type IssueTrackerProvider,
} from './application/ports/issue-tracker-provider';
import { DefectCreationService } from './application/services/defect-creation.service';
import { IntegrationConnectionService } from './application/services/integration-connection.service';
import { IssueLinkService } from './application/services/issue-link.service';
import { IssueTrackerClientService } from './application/services/issue-tracker-client.service';
import { IssueTrackerQueryService } from './application/services/issue-tracker-query.service';
import { IssueStatusSyncQueue } from './application/services/issue-status-sync.queue';
import { IssueStatusSyncService } from './application/services/issue-status-sync.service';
import { JiraDataCenterProvider } from './infrastructure/adapters/jira-data-center.provider';
import { OutboundUrlPolicy } from './infrastructure/adapters/outbound-url.policy';
import {
  createIssueTrackerConfig,
  ISSUE_TRACKER_CONFIG,
} from './infrastructure/config/issue-tracker.config';
import { IntegrationConnectionRepository } from './infrastructure/repositories/integration-connection.repository';
import { DefectCreationRepository } from './infrastructure/repositories/defect-creation.repository';
import { IssueLinkRepository } from './infrastructure/repositories/issue-link.repository';
import { IssueStatusSyncRepository } from './infrastructure/repositories/issue-status-sync.repository';
import {
  CaseIssueLinkController,
  ResultIssueLinkController,
} from './presentation/controllers/issue-link.controller';
import { JiraIntegrationController } from './presentation/controllers/jira-integration.controller';
import { IssueStatusSyncWorker } from './presentation/workers/issue-status-sync.worker';

@Module({
  imports: [AuthModule, CryptoModule],
  controllers: [JiraIntegrationController, CaseIssueLinkController, ResultIssueLinkController],
  providers: [
    { provide: ISSUE_TRACKER_CONFIG, useFactory: createIssueTrackerConfig },
    OutboundUrlPolicy,
    JiraDataCenterProvider,
    {
      provide: ISSUE_TRACKER_PROVIDERS,
      inject: [JiraDataCenterProvider],
      useFactory: (jira: JiraDataCenterProvider): IssueTrackerProvider[] => [jira],
    },
    IntegrationConnectionRepository,
    IntegrationConnectionService,
    IssueTrackerClientService,
    IssueTrackerQueryService,
    IssueLinkRepository,
    IssueStatusSyncRepository,
    DefectCreationRepository,
    IssueLinkService,
    DefectCreationService,
    IssueStatusSyncQueue,
    IssueStatusSyncService,
    IssueStatusSyncWorker,
  ],
})
export class IntegrationModule {}
