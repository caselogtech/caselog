import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccountTokenRepository } from './account-token.repository';
import { AuthController } from './auth.controller';
import { AUTH_CONFIG, createAuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { IdentityRepository } from './identity.repository';
import { PasswordService } from './password.service';
import { OrganizationAuthGuard } from './organization-auth.guard';
import { OrganizationJwtStrategy } from './organization-jwt.strategy';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionJwtStrategy } from './session-jwt.strategy';
import { TenantAccessRepository } from './tenant-access.repository';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceRepository } from './workspace.repository';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [JwtModule.register({}), PassportModule.register({ session: false })],
  controllers: [AuthController, WorkspaceController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: createAuthConfig },
    AccountTokenRepository,
    AuthService,
    AuthTokenService,
    IdentityRepository,
    PasswordService,
    OrganizationAuthGuard,
    OrganizationJwtStrategy,
    SessionAuthGuard,
    SessionJwtStrategy,
    TenantAccessRepository,
    WorkspaceRepository,
    WorkspaceService,
  ],
  exports: [OrganizationAuthGuard],
})
export class AuthModule {}
