import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/database/prisma.service';

export type Identity = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

export type IdentityWithCredential = Identity & {
  passwordHash?: string;
};

export type SessionIdentity = Identity & {
  sessionId: string;
  familyId: string;
};

export type RotationResult =
  | { kind: 'rotated'; identity: SessionIdentity }
  | { kind: 'invalid' | 'expired' | 'reused' };

@Injectable()
export class IdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<IdentityWithCredential | undefined> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { passwordCredential: true },
    });

    if (!user) {
      return undefined;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      passwordHash: user.passwordCredential?.passwordHash,
    };
  }

  async findById(id: string): Promise<Identity | undefined> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
    });
    return user
      ? {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: Boolean(user.emailVerifiedAt),
        }
      : undefined;
  }

  async createIdentity(
    email: string,
    displayName: string,
    passwordHash: string,
  ): Promise<Identity | undefined> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName,
          passwordCredential: { create: { passwordHash } },
        },
        select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
      });
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: Boolean(user.emailVerifiedAt),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return undefined;
      }
      throw error;
    }
  }

  async createSession(
    identity: Identity,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity> {
    const session = await this.prisma.authSession.create({
      data: {
        userId: identity.id,
        familyId: randomUUID(),
        refreshTokenHash,
        expiresAt,
      },
      select: { id: true, familyId: true },
    });

    return { ...identity, sessionId: session.id, familyId: session.familyId };
  }

  async rotateSession(
    currentTokenHash: string,
    nextTokenHash: string,
    nextExpiresAt: Date,
  ): Promise<RotationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.authSession.findUnique({
        where: { refreshTokenHash: currentTokenHash },
        include: { user: true },
      });

      if (!current || current.user.deletedAt) {
        return { kind: 'invalid' };
      }

      const now = new Date();
      if (current.revokedAt) {
        await transaction.authSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'refresh_token_reuse' },
        });
        return { kind: 'reused' };
      }

      if (current.expiresAt <= now) {
        await transaction.authSession.update({
          where: { id: current.id },
          data: { revokedAt: now, revocationReason: 'expired' },
        });
        return { kind: 'expired' };
      }

      const replacement = await transaction.authSession.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          refreshTokenHash: nextTokenHash,
          expiresAt: nextExpiresAt,
        },
        select: { id: true },
      });
      const rotated = await transaction.authSession.updateMany({
        where: { id: current.id, revokedAt: null },
        data: {
          revokedAt: now,
          revocationReason: 'rotated',
          replacedById: replacement.id,
          lastUsedAt: now,
        },
      });

      if (rotated.count !== 1) {
        await transaction.authSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'refresh_token_reuse' },
        });
        return { kind: 'reused' };
      }

      return {
        kind: 'rotated',
        identity: {
          id: current.user.id,
          email: current.user.email,
          displayName: current.user.displayName,
          emailVerified: Boolean(current.user.emailVerifiedAt),
          sessionId: replacement.id,
          familyId: current.familyId,
        },
      };
    });
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: { id: true },
    });
    return Boolean(session);
  }

  async revokeByRefreshTokenHash(refreshTokenHash: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'logout' },
    });
  }
}
