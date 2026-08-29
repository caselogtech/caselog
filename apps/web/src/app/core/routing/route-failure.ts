import { HttpErrorResponse } from '@angular/common/http';

export const ROUTE_FAILURE_STATES = ['forbidden', 'notFound', 'offline', 'serverError'] as const;

export type RouteFailureState = (typeof ROUTE_FAILURE_STATES)[number];

export function routeFailureState(error: unknown): RouteFailureState | null {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'notFound';
    if (error.status === 0) return 'offline';
    if (error.status >= 500) return 'serverError';
    return null;
  }

  return error instanceof Error ? 'serverError' : null;
}

export function routeFailurePath(state: RouteFailureState): string {
  return state === 'serverError' ? 'server-error' : state === 'notFound' ? 'not-found' : state;
}
