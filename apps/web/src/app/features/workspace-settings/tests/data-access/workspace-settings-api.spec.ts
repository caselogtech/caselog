import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { WorkspaceSettingsApi } from '../../data-access/workspace-settings-api';

describe('WorkspaceSettingsApi', () => {
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

  it('loads settings after opening workspace access', async () => {
    const response = TestBed.inject(WorkspaceSettingsApi).get('acme');
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/workspace');
    expect(request.request.method).toBe('GET');
    request.flush({ workspace: workspace() });

    await expect(response).resolves.toMatchObject({ workspace: { slug: 'acme' } });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('updates the server-owned workspace identity', async () => {
    const response = TestBed.inject(WorkspaceSettingsApi).update('acme', {
      name: 'Acme Quality',
      slug: 'acme-quality',
    });
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/workspace');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Acme Quality', slug: 'acme-quality' });
    request.flush({
      workspace: { ...workspace(), name: 'Acme Quality', slug: 'acme-quality' },
    });

    await expect(response).resolves.toMatchObject({
      workspace: { name: 'Acme Quality', slug: 'acme-quality' },
    });
  });

  it('sends an explicit confirmation when deleting', async () => {
    const response = TestBed.inject(WorkspaceSettingsApi).delete('acme', {
      confirmation: 'Acme QA',
    });
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/workspace');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ confirmation: 'Acme QA' });
    request.flush({
      workspace: {
        ...workspace(),
        deletedAt: '2026-08-27T22:00:00.000Z',
        recoverableUntil: '2026-09-26T22:00:00.000Z',
      },
    });

    await expect(response).resolves.toMatchObject({
      workspace: { deletedAt: '2026-08-27T22:00:00.000Z' },
    });
  });
});

function workspace() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Acme QA',
    slug: 'acme',
    deletedAt: null,
    recoverableUntil: null,
  };
}
