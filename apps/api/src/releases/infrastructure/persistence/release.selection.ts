import type { Prisma } from '../../../generated/prisma/client';

export const RELEASE_SELECTION = {
  id: true,
  key: true,
  name: true,
  state: true,
  targetDate: true,
  externalReference: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
  releasedAt: true,
  cancelledAt: true,
  environment: { select: { id: true, name: true, slug: true, state: true } },
  _count: { select: { candidates: true } },
} satisfies Prisma.ReleaseSelect;
