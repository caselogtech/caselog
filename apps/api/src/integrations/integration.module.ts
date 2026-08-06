import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../core/crypto/crypto.module';
import {
  ISSUE_TRACKER_PROVIDERS,
  type IssueTrackerProvider,
} from './application/ports/issue-tracker-provider';
import { IntegrationConnectionService } from './application/services/integration-connection.service';
import { JiraDataCenterProvider } from './infrastructure/adapters/jira-data-center.provider';
import { OutboundUrlPolicy } from './infrastructure/adapters/outbound-url.policy';
import {
  createIssueTrackerConfig,
  ISSUE_TRACKER_CONFIG,
} from './infrastructure/config/issue-tracker.config';
import { IntegrationConnectionRepository } from './infrastructure/repositories/integration-connection.repository';
import { JiraIntegrationController } from './presentation/controllers/jira-integration.controller';

@Module({
  imports: [AuthModule, CryptoModule],
  controllers: [JiraIntegrationController],
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
  ],
})
export class IntegrationModule {}
