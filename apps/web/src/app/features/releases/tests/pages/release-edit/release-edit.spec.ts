import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ReleaseSummary } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReleasesApi } from '../../../data-access/releases-api';
import { ReleaseEdit } from '../../../pages/release-edit/release-edit';

const release: ReleaseSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'R-1',
  name: 'Release without environment',
  state: 'draft',
  environment: null,
  targetDate: null,
  externalReference: null,
  candidateCount: 0,
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
  activatedAt: null,
  releasedAt: null,
  cancelledAt: null,
};

describe('ReleaseEdit', () => {
  const api = { releaseDetail: vi.fn(), listEnvironments: vi.fn(), updateRelease: vi.fn() };
  let queryClient: QueryClient;
  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.releaseDetail.mockReset().mockResolvedValue({ release, candidates: [], history: [] });
    api.listEnvironments.mockReset().mockResolvedValue({
      items: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Production', state: 'active' }],
    });
    api.updateRelease.mockReset().mockResolvedValue({ release: { ...release, name: 'Updated' } });
    await TestBed.configureTestingModule({
      imports: [ReleaseEdit, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReleasesApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme',
                project: 'checkout',
                releaseId: release.id,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });
  afterEach(() => queryClient.clear());
  async function open() {
    const fixture = TestBed.createComponent(ReleaseEdit);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.initial()).not.toBeNull();
    });
    fixture.detectChanges();
    return fixture;
  }
  it('loads an existing release, adds an environment, saves its version and invalidates shared views', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const fixture = await open();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    fixture.componentInstance.form.patchValue({
      name: ' Updated ',
      environmentId: '22222222-2222-4222-8222-222222222222',
    });
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(api.updateRelease).toHaveBeenCalledWith('acme', 'checkout', release.id, {
      name: 'Updated',
      environmentId: '22222222-2222-4222-8222-222222222222',
      targetDate: null,
      externalReference: null,
      expectedUpdatedAt: release.updatedAt,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['release-readiness', 'acme', 'checkout'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['release-environments', 'acme', 'checkout'],
    });
  });
  it('retains unsaved input across background refresh and server failures', async () => {
    const fixture = await open();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    fixture.componentInstance.form.patchValue({ name: 'My unsaved change' });
    api.releaseDetail.mockResolvedValue({
      release: { ...release, name: 'Someone else' },
      candidates: [],
      history: [],
    });
    await fixture.componentInstance.detail.refetch();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.name.value).toBe('My unsaved change');
    api.updateRelease.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(fixture.componentInstance.save.isError()).toBe(true));
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.name.value).toBe('My unsaved change');
    expect(fixture.nativeElement.textContent).toContain('Unable to save release');
  });
  it('explains conflicts, blocks resubmission and reloads only after an explicit discard', async () => {
    const fixture = await open();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    fixture.componentInstance.form.patchValue({ name: 'Unsaved' });
    api.updateRelease.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: { code: 'release_changed', message: 'Changed', details: {}, requestId: 'test' },
        },
      }),
    );
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(fixture.componentInstance.conflict()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reload release and discard my edits');
    fixture.componentInstance.submit();
    expect(api.updateRelease).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.form.controls.name.value).toBe('Unsaved');
    api.releaseDetail.mockResolvedValue({
      release: { ...release, name: 'Latest', updatedAt: '2026-11-21T12:01:00.000Z' },
      candidates: [],
      history: [],
    });
    await fixture.componentInstance.reload();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.name.value).toBe('Latest');
    await vi.waitFor(() => expect(fixture.componentInstance.conflict()).toBe(false));
  });
  it.each(['released', 'cancelled'] as const)('keeps %s releases read-only', async (state) => {
    api.releaseDetail.mockResolvedValue({
      release: { ...release, state },
      candidates: [],
      history: [],
    });
    const fixture = await open();
    fixture.componentInstance.submit();
    expect(api.updateRelease).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Release editing is unavailable');
  });
  it('denies lower roles and does not submit invalid or unloaded form data', async () => {
    const fixture = await open();
    fixture.componentInstance.form.patchValue({ name: ' ' });
    fixture.componentInstance.submit();
    expect(api.updateRelease).not.toHaveBeenCalled();
    TestBed.inject(WorkspaceSession).role.set('read_only');
    fixture.componentInstance.form.patchValue({ name: 'Changed' });
    fixture.componentInstance.submit();
    expect(api.updateRelease).not.toHaveBeenCalled();
  });
});
