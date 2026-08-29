import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { AuditLogListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceAuditApi } from '../../../data-access/workspace-audit-api';
import { WorkspaceAuditSettings } from '../../../pages/audit/workspace-audit-settings';

const response: AuditLogListResponse = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      actor: { id: '33333333-3333-4333-8333-333333333333', type: 'user' },
      action: 'workspace.updated',
      target: { type: 'workspace', id: '55555555-5555-4555-8555-555555555555' },
      metadata: { name: 'Acme Quality', slug: 'acme' },
      createdAt: '2026-08-29T08:00:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('WorkspaceAuditSettings', () => {
  const auditApi = { list: vi.fn() };
  let queryClient: QueryClient;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryParams = new BehaviorSubject(convertToParamMap({}));
    auditApi.list.mockReset().mockResolvedValue(response);
    await TestBed.configureTestingModule({
      imports: [WorkspaceAuditSettings, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceAuditApi, useValue: auditApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme' }),
              queryParamMap: queryParams.value,
            },
            queryParamMap: queryParams.asObservable(),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders attributable server-owned audit records', async () => {
    const fixture = TestBed.createComponent(WorkspaceAuditSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.auditLogs.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Workspace updated');
    expect(text).toContain('User');
    expect(text).toContain('33333333-3333-4333-8333-333333333333');
    expect(text).toContain('Acme Quality');
  });

  it('keeps the exact action filter in the canonical URL', async () => {
    const fixture = TestBed.createComponent(WorkspaceAuditSettings);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.auditLogs.isSuccess()).toBe(true));

    fixture.componentInstance.filterForm.controls.action.setValue('member.role_updated');
    fixture.componentInstance.applyFilter();
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { action: 'member.role_updated' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    queryParams.next(convertToParamMap({ action: 'member.role_updated' }));
    await vi.waitFor(() =>
      expect(auditApi.list).toHaveBeenLastCalledWith('acme', undefined, 'member.role_updated'),
    );
  });

  it('rejects malformed action filters before navigation', () => {
    const fixture = TestBed.createComponent(WorkspaceAuditSettings);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.componentInstance.filterForm.controls.action.setValue('Member updated');

    fixture.componentInstance.applyFilter();

    expect(fixture.componentInstance.filterForm.controls.action.touched).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
