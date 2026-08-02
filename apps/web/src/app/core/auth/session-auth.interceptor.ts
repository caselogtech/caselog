import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BrowserSession } from './browser-session';

export const sessionAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const accessToken = inject(BrowserSession).accessToken();
  if (!accessToken || !request.url.startsWith('/api/')) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { Authorization: `Bearer ${accessToken}` },
    }),
  );
};
