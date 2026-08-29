import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { AuthApi } from '../../../../auth/public-api';
import { ContextSwitchers } from '../../../components/context-switchers/context-switchers';
import { WorkspaceApi } from '../../../data-access/workspace-api';

describe('ContextSwitchers', () => {
  const authApi = { listWorkspaces: vi.fn() };
  const workspaceApi = { listProjects: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    authApi.listWorkspaces.mockReset().mockResolvedValue({
      workspaces: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Acme Quality',
          slug: 'acme',
          membershipId: '22222222-2222-4222-8222-222222222222',
          role: 'owner',
          deletedAt: null,
          recoverableUntil: null,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Mobile Guild',
          slug: 'mobile-guild',
          membershipId: '44444444-4444-4444-8444-444444444444',
          role: 'tester',
          deletedAt: null,
          recoverableUntil: null,
        },
      ],
    });
    workspaceApi.listProjects.mockReset().mockResolvedValue({
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          key: 'CHECKOUT',
          slug: 'checkout',
          name: 'Checkout Platform',
          state: 'active',
          caseCount: 14,
          activeRunCount: 2,
          createdAt: '2026-08-20T12:00:00.000Z',
          updatedAt: '2026-08-27T12:00:00.000Z',
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          key: 'MOBILE',
          slug: 'mobile',
          name: 'Mobile Apps',
          state: 'active',
          caseCount: 8,
          activeRunCount: 1,
          createdAt: '2026-08-21T12:00:00.000Z',
          updatedAt: '2026-08-28T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    await TestBed.configureTestingModule({
      imports: [ContextSwitchers, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        { provide: WorkspaceApi, useValue: workspaceApi },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('loads real workspace and project names and marks the current contexts', async () => {
    const fixture = TestBed.createComponent(ContextSwitchers);
    fixture.componentRef.setInput('workspaceSlug', 'acme');
    fixture.componentRef.setInput('projectSlug', 'checkout');
    fixture.detectChanges();

    await vi.waitFor(() => {
      expect(fixture.componentInstance.workspaces.isSuccess()).toBe(true);
      expect(fixture.componentInstance.projects.isSuccess()).toBe(true);
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.workspace-switcher summary')?.textContent).toContain(
      'Acme Quality',
    );
    expect(element.querySelector('.project-switcher summary')?.textContent).toContain(
      'Checkout Platform',
    );
    expect(
      element.querySelector('.workspace-switcher a[aria-current="true"]')?.textContent,
    ).toContain('Acme Quality');
    expect(
      element.querySelector('.project-switcher a[aria-current="true"]')?.textContent,
    ).toContain('Checkout Platform');
    expect(workspaceApi.listProjects).toHaveBeenCalledWith('acme', undefined);
  });

  it('closes an open context menu with Escape and restores summary focus', () => {
    const fixture = TestBed.createComponent(ContextSwitchers);
    fixture.componentRef.setInput('workspaceSlug', 'acme');
    fixture.componentRef.setInput('projectSlug', 'checkout');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const menu = element.querySelector<HTMLDetailsElement>('.project-switcher');
    const summary = element.querySelector<HTMLElement>('.project-switcher summary');
    if (!menu) throw new Error('Project switcher was not rendered');

    menu.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
