import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { AccountTokenPurpose } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

@Injectable()
export class AccountTokenRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    purpose: AccountTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.issueOnce(userId, purpose, tokenHash, expiresAt);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      await this.issueOnce(userId, purpose, tokenHash, expiresAt);
    }
  }

  async consumeEmailVerification(tokenHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const token = await transaction.accountToken.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (
        token?.purpose !== 'EMAIL_VERIFICATION' ||
        token.consumedAt ||
        token.revokedAt ||
        token.expiresAt <= now
      ) {
        return false;
      }

      const consumed = await transaction.accountToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }

      await transaction.user.updateMany({
        where: { id: token.userId, deletedAt: null, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      return true;
    });
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const token = await transaction.accountToken.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (
        token?.purpose !== 'PASSWORD_RESET' ||
        token.consumedAt ||
        token.revokedAt ||
        token.expiresAt <= now
      ) {
        return false;
      }

      const consumed = await transaction.accountToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }

      await transaction.passwordCredential.update({
        where: { userId: token.userId },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'password_reset' },
      });
      return true;
    });
  }

  private async issueOnce(
    userId: string,
    purpose: AccountTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.accountToken.updateMany({
        where: { userId, purpose, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.accountToken.create({
        data: { userId, purpose, tokenHash, expiresAt },
      });
    });
  }
}
