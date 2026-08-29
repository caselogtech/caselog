import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { RouteState } from '../../../pages/route-state/route-state';

describe('RouteState', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouteState, i18nTestingModule()],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { kind: 'serverError' },
              queryParamMap: convertToParamMap({ returnUrl: '/acme/checkout/releases' }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('renders a recoverable server-error frame for a signed-in user', () => {
    TestBed.inject(BrowserSession).user.set({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      displayName: 'Demo Owner',
      emailVerified: true,
    });
    const fixture = TestBed.createComponent(RouteState);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('Caselog could not load this page');
    expect(element.querySelector('.state-code')?.textContent).toContain('500');
    expect(element.querySelector('button')?.textContent).toContain('Try again');
    expect(element.querySelector('a.app-button-secondary')?.getAttribute('href')).toBe(
      '/auth/workspaces',
    );
  });

  it('retries only the validated internal return URL', async () => {
    const fixture = TestBed.createComponent(RouteState);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await fixture.componentInstance.recover();

    expect(navigateByUrl).toHaveBeenCalledWith('/acme/checkout/releases');
  });
});
