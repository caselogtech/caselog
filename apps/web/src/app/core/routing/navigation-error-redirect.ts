import { inject } from '@angular/core';
import { type NavigationError, RedirectCommand, Router } from '@angular/router';
import { routeFailurePath, routeFailureState } from './route-failure';

export function navigationErrorRedirect(error: NavigationError): RedirectCommand | undefined {
  if (error.url.startsWith('/status/')) return undefined;

  const router = inject(Router);
  const failureState = routeFailureState(error.error) ?? 'serverError';
  return new RedirectCommand(
    router.createUrlTree(['/status', routeFailurePath(failureState)], {
      queryParams: { returnUrl: error.url },
    }),
    { replaceUrl: true },
  );
}
