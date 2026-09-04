import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { BrowserSession } from '../../../core/auth/browser-session';
import { StaffApi } from '../data-access/staff-api';
import { StaffSession } from '../state/staff-session';

export const staffAccessGuard: CanActivateFn = async (_route, state) => {
  const browserSession = inject(BrowserSession);
  const router = inject(Router);
  const staffApi = inject(StaffApi);
  const staffSession = inject(StaffSession);

  if (!browserSession.accessToken()) {
    return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }

  try {
    staffSession.start(await staffApi.session());
    return true;
  } catch (error) {
    staffSession.clear();
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
    }
    return router.createUrlTree(['/status/forbidden'], {
      queryParams: { returnUrl: state.url },
    });
  }
};
