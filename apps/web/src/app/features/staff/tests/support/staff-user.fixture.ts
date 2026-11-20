import type { StaffUserDetailResponse } from '@caselog/schemas';
import { workspaceDetail } from './staff-workspace.fixture';

export const userDetail: StaffUserDetailResponse = {
  user: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'owner@example.com',
    displayName: 'Customer owner',
    emailVerified: true,
    activeWorkspaceCount: 1,
    billingAccountCount: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
  },
  workspaces: [
    {
      id: workspaceDetail.workspace.id,
      name: workspaceDetail.workspace.name,
      slug: workspaceDetail.workspace.slug,
      role: 'owner',
      deletedAt: null,
    },
  ],
  nextCursor: workspaceDetail.workspace.id,
};
