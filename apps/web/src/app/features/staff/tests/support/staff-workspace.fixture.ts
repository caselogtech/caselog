import type { StaffWorkspaceDetailResponse } from '@caselog/schemas';

export const workspaceDetail: StaffWorkspaceDetailResponse = {
  workspace: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Example customer',
    slug: 'example-customer',
    billingAccount: null,
    owner: {
      userId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Customer owner',
      email: 'owner@example.com',
    },
    memberCount: 3,
    projectCount: 2,
    storageBytes: '1024',
    createdAt: '2026-11-19T10:00:00.000Z',
    deletedAt: null,
  },
  usage: {
    testCases: 8,
    testRuns: 4,
    openTestRuns: 1,
    ingestions: 5,
    pendingUploads: 2,
    pendingStorageBytes: '2048',
  },
  observedAt: '2026-11-20T10:00:00.000Z',
};
