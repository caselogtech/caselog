import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NavigationError, provideRouter } from '@angular/router';
import { navigationErrorRedirect } from './navigation-error-redirect';

describe('navigationErrorRedirect', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('redirects failed navigation to the server-error frame with a safe retry target', () => {
    const command = TestBed.runInInjectionContext(() =>
      navigationErrorRedirect(
        new NavigationError(1, '/acme/checkout/releases', new Error('chunk unavailable')),
      ),
    );

    expect(command?.redirectTo.toString()).toBe(
      '/status/server-error?returnUrl=%2Facme%2Fcheckout%2Freleases',
    );
    expect(command?.navigationBehaviorOptions).toEqual({ replaceUrl: true });
  });

  it('does not create a redirect loop if the status route itself fails', () => {
    const command = TestBed.runInInjectionContext(() =>
      navigationErrorRedirect(
        new NavigationError(2, '/status/server-error', new Error('chunk unavailable')),
      ),
    );

    expect(command).toBeUndefined();
  });

  it('preserves classified failures thrown by route guards', () => {
    const command = TestBed.runInInjectionContext(() =>
      navigationErrorRedirect(
        new NavigationError(
          3,
          '/acme/checkout/releases/new',
          new HttpErrorResponse({ status: 403 }),
        ),
      ),
    );

    expect(command?.redirectTo.toString()).toBe(
      '/status/forbidden?returnUrl=%2Facme%2Fcheckout%2Freleases%2Fnew',
    );
  });
});
