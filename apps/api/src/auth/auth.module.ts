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
import { SessionAuthGuard } from './session-auth.guard';
import { SessionJwtStrategy } from './session-jwt.strategy';
import { TenantAccessRepository } from './tenant-access.repository';

@Module({
  imports: [JwtModule.register({}), PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: createAuthConfig },
    AccountTokenRepository,
    AuthService,
    AuthTokenService,
    IdentityRepository,
    PasswordService,
    SessionAuthGuard,
    SessionJwtStrategy,
    TenantAccessRepository,
  ],
})
export class AuthModule {}
