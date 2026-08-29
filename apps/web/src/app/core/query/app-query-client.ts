import { inject, InjectionToken } from '@angular/core';
import { QueryCache, QueryClient } from '@tanstack/angular-query-experimental';
import { RouteFailureRedirect } from '../routing/route-failure-redirect';

export function createAppQueryClient(onRouteFailure: (error: unknown) => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data === undefined) onRouteFailure(error);
      },
    }),
    defaultOptions: {
      queries: { retry: 1 },
      mutations: { retry: false },
    },
  });
}

export const APP_QUERY_CLIENT = new InjectionToken<QueryClient>('APP_QUERY_CLIENT', {
  providedIn: 'root',
  factory: () => {
    const routeFailureRedirect = inject(RouteFailureRedirect);
    return createAppQueryClient((error) => routeFailureRedirect.handle(error));
  },
});
