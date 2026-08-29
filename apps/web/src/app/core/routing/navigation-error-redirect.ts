import { inject } from '@angular/core';
import { type NavigationError, RedirectCommand, Router } from '@angular/router';

export function navigationErrorRedirect(error: NavigationError): RedirectCommand | undefined {
  if (error.url.startsWith('/status/')) return undefined;

  const router = inject(Router);
  return new RedirectCommand(
    router.createUrlTree(['/status', 'server-error'], {
      queryParams: { returnUrl: error.url },
    }),
    { replaceUrl: true },
  );
}
