import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { InstanceModule } from '../instance/public-api';
import { AccountTokenRepository } from './infrastructure/repositories/account-token.repository';
import { ApiTokenController } from './presentation/controllers/api-token.controller';
import { ApiTokenRepository } from './infrastructure/repositories/api-token.repository';
import { ApiTokenService } from './application/services/api-token.service';
import { AuthController } from './presentation/controllers/auth.controller';
import { AUTH_CONFIG, createAuthConfig } from './infrastructure/config/auth.config';
import { AuthService } from './application/services/auth.service';
import { AuthTokenService } from './application/services/auth-token.service';
import { IdentityRepository } from './infrastructure/repositories/identity.repository';
import { PasswordService } from './application/services/password.service';
import { OrganizationAuthGuard } from './presentation/guards/organization-auth.guard';
import { OrganizationRoleGuard } from './presentation/guards/organization-role.guard';
import { OrganizationJwtStrategy } from './infrastructure/strategies/organization-jwt.strategy';
import { SessionAuthGuard } from './presentation/guards/session-auth.guard';
import { SessionJwtStrategy } from './infrastructure/strategies/session-jwt.strategy';
import { TenantAccessRepository } from './infrastructure/repositories/tenant-access.repository';
import { WorkspaceController } from './presentation/controllers/workspace.controller';
import { WorkspaceRepository } from './infrastructure/repositories/workspace.repository';
import { WorkspaceService } from './application/services/workspace.service';
import { WorkspaceSettingsController } from './presentation/controllers/workspace-settings.controller';
import { WorkspaceSettingsRepository } from './infrastructure/repositories/workspace-settings.repository';
import { WorkspaceSettingsService } from './application/services/workspace-settings.service';
import {
  createWorkspacePurgeConfig,
  WORKSPACE_PURGE_CONFIG,
} from './infrastructure/config/workspace-purge.config';
import { WorkspacePurgeQueue } from './application/services/workspace-purge.queue';
import { WorkspacePurgeService } from './application/services/workspace-purge.service';
import { WorkspacePurgeRepository } from './infrastructure/repositories/workspace-purge.repository';
import { WorkspacePurgeWorker } from './presentation/workers/workspace-purge.worker';
import { RefreshSessionCookieService } from './infrastructure/cookies/refresh-session-cookie.service';

@Module({
  imports: [InstanceModule, JwtModule.register({}), PassportModule.register({ session: false })],
  controllers: [
    ApiTokenController,
    AuthController,
    WorkspaceController,
    WorkspaceSettingsController,
  ],
  providers: [
    { provide: AUTH_CONFIG, useFactory: createAuthConfig },
    { provide: WORKSPACE_PURGE_CONFIG, useFactory: createWorkspacePurgeConfig },
    AccountTokenRepository,
    ApiTokenRepository,
    ApiTokenService,
    AuthService,
    AuthTokenService,
    IdentityRepository,
    PasswordService,
    RefreshSessionCookieService,
    OrganizationAuthGuard,
    OrganizationRoleGuard,
    OrganizationJwtStrategy,
    SessionAuthGuard,
    SessionJwtStrategy,
    TenantAccessRepository,
    WorkspaceRepository,
    WorkspaceService,
    WorkspaceSettingsRepository,
    WorkspaceSettingsService,
    WorkspacePurgeQueue,
    WorkspacePurgeRepository,
    WorkspacePurgeService,
    WorkspacePurgeWorker,
  ],
  exports: [
    ApiTokenService,
    AuthService,
    OrganizationAuthGuard,
    OrganizationRoleGuard,
    RefreshSessionCookieService,
    SessionAuthGuard,
    WorkspaceService,
  ],
})
export class AuthModule {}
