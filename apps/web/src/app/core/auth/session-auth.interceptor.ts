import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BrowserSession } from './browser-session';
import { WorkspaceSession } from './workspace-session';

export const sessionAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/v1/')) {
    return next(request);
  }

  const accessToken = request.url.startsWith('/api/v1/auth/')
    ? inject(BrowserSession).accessToken()
    : inject(WorkspaceSession).accessToken();

  return accessToken
    ? next(request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }))
    : next(request);
};
