import type { EnvironmentSettingsSummary, OrganizationAccessPrincipal } from '@caselog/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { EnvironmentService } from '../../application/services/environment.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const environment: EnvironmentSettingsSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Production',
  slug: 'production',
  description: 'Customer traffic',
  state: 'active',
  activeReleaseCount: 2,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-29T08:00:00.000Z',
};

describe('EnvironmentService', () => {
  it('returns server-owned active release counts', async () => {
    const repository = repositoryMock();
    repository.list.mockResolvedValue({ kind: 'found', value: [environment] });
    const service = new EnvironmentService(repository as never);

    await expect(service.list(ORGANIZATION_ID, 'checkout')).resolves.toEqual({
      items: [environment],
    });
  });

  it('updates the full editable environment snapshot for leads and above', async () => {
    const repository = repositoryMock();
    const request = {
      name: 'Production EU',
      slug: 'production-eu',
      description: null,
    };
    const updated = { ...environment, ...request };
    repository.update.mockResolvedValue({ kind: 'found', value: updated });
    const service = new EnvironmentService(repository as never);

    await expect(
      service.update(principal('lead'), 'checkout', environment.id, request),
    ).resolves.toEqual({ environment: updated });
    expect(repository.update).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'checkout',
      environment.id,
      USER_ID,
      request,
    );
  });

  it('maps missing environments and project-local slug conflicts', async () => {
    const repository = repositoryMock();
    const service = new EnvironmentService(repository as never);
    const request = { name: 'Production', slug: 'production', description: null };
    repository.update.mockResolvedValueOnce({ kind: 'environment_not_found' });

    await expect(
      service.update(principal('owner'), 'checkout', environment.id, request),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    repository.update.mockResolvedValueOnce({ kind: 'slug_conflict' });
    await expect(
      service.update(principal('owner'), 'checkout', environment.id, request),
    ).rejects.toMatchObject({ code: 'environment_slug_taken' });
  });

  it('rejects low-privilege sessions and every API token', async () => {
    const service = new EnvironmentService(repositoryMock() as never);
    const request = { name: 'Production', slug: 'production', description: null };
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
      service.update(principal('tester'), 'checkout', environment.id, request),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.update(apiToken, 'checkout', environment.id, request),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
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
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
}
