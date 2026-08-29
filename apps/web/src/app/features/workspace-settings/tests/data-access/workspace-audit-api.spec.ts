import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { WorkspaceAuditApi } from '../../data-access/workspace-audit-api';

describe('WorkspaceAuditApi', () => {
  const workspaceAccess = { open: vi.fn() };

  beforeEach(() => {
    workspaceAccess.open.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkspaceAccess, useValue: workspaceAccess },
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists filtered immutable audit history with a stable cursor', async () => {
    const response = TestBed.inject(WorkspaceAuditApi).list(
      'acme',
      '22222222-2222-4222-8222-222222222222',
      'member.role_updated',
    );
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url, params }) =>
        url === '/api/v1/audit-logs' &&
        params.get('limit') === '25' &&
        params.get('cursor') === '22222222-2222-4222-8222-222222222222' &&
        params.get('action') === 'member.role_updated',
    );
    request.flush({ items: [auditLog()], nextCursor: null });

    await expect(response).resolves.toMatchObject({
      items: [{ action: 'member.role_updated' }],
    });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });
});

function auditLog() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    actor: { id: '33333333-3333-4333-8333-333333333333', type: 'user' },
    action: 'member.role_updated',
    target: { type: 'membership', id: '44444444-4444-4444-8444-444444444444' },
    metadata: { previousRole: 'tester', role: 'lead' },
    createdAt: '2026-08-29T08:00:00.000Z',
  };
}
