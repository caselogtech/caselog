import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { ProjectSettingsApi } from '../../data-access/project-settings-api';

describe('ProjectSettingsApi', () => {
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

  it('loads active project settings after opening workspace access', async () => {
    const response = TestBed.inject(ProjectSettingsApi).get('acme', 'checkout');
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/projects/checkout');
    expect(request.request.method).toBe('GET');
    request.flush({ project: project() });

    await expect(response).resolves.toMatchObject({ project: { name: 'Checkout' } });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('updates only the editable display name', async () => {
    const response = TestBed.inject(ProjectSettingsApi).update('acme', 'checkout', {
      name: 'Storefront checkout',
    });
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/projects/checkout');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Storefront checkout' });
    request.flush({ project: { ...project(), name: 'Storefront checkout' } });

    await expect(response).resolves.toMatchObject({
      project: { name: 'Storefront checkout', key: 'SHOP', slug: 'checkout' },
    });
  });

  it('archives the canonical project resource', async () => {
    const response = TestBed.inject(ProjectSettingsApi).archive('acme', 'checkout');
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/projects/checkout');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    await expect(response).resolves.toBeUndefined();
  });
});

function project() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'SHOP',
    slug: 'checkout',
    name: 'Checkout',
    state: 'active',
    caseCount: 12,
    activeRunCount: 2,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-29T08:00:00.000Z',
  };
}
