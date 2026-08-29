import type { OrganizationAccessPrincipal, ProjectSummary } from '@caselog/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { ProjectService } from '../../application/services/project.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  key: 'SHOP',
  slug: 'checkout',
  name: 'Checkout',
  state: 'active',
  caseCount: 12,
  activeRunCount: 2,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-29T08:00:00.000Z',
};

describe('ProjectService', () => {
  it('returns active project settings by canonical slug', async () => {
    const repository = repositoryMock();
    repository.findActive.mockResolvedValue(project);
    const service = new ProjectService(repository as never);

    await expect(service.get(principal('read_only'), 'checkout')).resolves.toEqual({ project });
    expect(repository.findActive).toHaveBeenCalledWith(ORGANIZATION_ID, 'checkout');
  });

  it('does not disclose a missing or archived project', async () => {
    const repository = repositoryMock();
    repository.findActive.mockResolvedValue(null);
    const service = new ProjectService(repository as never);

    await expect(service.get(principal('owner'), 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('updates the editable project identity for leads and above', async () => {
    const repository = repositoryMock();
    const updated = { ...project, name: 'Storefront checkout' };
    repository.update.mockResolvedValue({ kind: 'updated', value: updated });
    const service = new ProjectService(repository as never);

    await expect(
      service.update(principal('lead'), 'checkout', { name: 'Storefront checkout' }),
    ).resolves.toEqual({ project: updated });
    expect(repository.update).toHaveBeenCalledWith(ORGANIZATION_ID, 'checkout', USER_ID, {
      name: 'Storefront checkout',
    });
  });

  it('rejects project updates from low-privilege sessions and every API token', async () => {
    const service = new ProjectService(repositoryMock() as never);
    const apiToken: OrganizationAccessPrincipal = {
      sub: USER_ID,
      tokenType: 'api_token',
      apiTokenId: '44444444-4444-4444-8444-444444444444',
      organizationId: ORGANIZATION_ID,
      membershipId: '55555555-5555-4555-8555-555555555555',
      role: 'owner',
      scopes: ['runs:read'],
    };

    await expect(
      service.update(principal('tester'), 'checkout', { name: 'Denied' }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(service.update(apiToken, 'checkout', { name: 'Denied' })).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });
});

function principal(
  role: Extract<OrganizationAccessPrincipal, { tokenType: 'organization' }>['role'],
) {
  return {
    sub: USER_ID,
    sid: '66666666-6666-4666-8666-666666666666',
    tokenType: 'organization' as const,
    organizationId: ORGANIZATION_ID,
    membershipId: '55555555-5555-4555-8555-555555555555',
    role,
  };
}

function repositoryMock() {
  return {
    list: vi.fn(),
    findActive: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
}
