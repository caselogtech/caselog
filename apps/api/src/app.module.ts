import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AttachmentModule } from './attachments/attachment.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { DatabaseModule } from './core/database/database.module';
import { HealthModule } from './core/health/health.module';
import { ImportModule } from './imports/import.module';
import { IntegrationModule } from './integrations/integration.module';
import { JobsModule } from './core/jobs/jobs.module';
import { ObservabilityModule } from './core/observability/observability.module';
import { MailModule } from './core/mail/mail.module';
import { MembersModule } from './members/members.module';
import { StorageModule } from './core/storage/storage.module';
import { ProjectModule } from './projects/project.module';
import { ReportingModule } from './reporting/reporting.module';
import { ReleaseModule } from './releases/public-api';
import { TestCaseModule } from './test-cases/test-case.module';
import { TestRunModule } from './test-runs/test-run.module';

@Module({
  imports: [
    DatabaseModule,
    ObservabilityModule,
    JobsModule,
    AuditModule,
    AttachmentModule,
    MailModule,
    StorageModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    ImportModule,
    IntegrationModule,
    AuthModule,
    MembersModule,
    ProjectModule,
    ReportingModule,
    ReleaseModule,
    TestCaseModule,
    TestRunModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
