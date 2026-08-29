import type { Route, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const systemTranslations = provideTranslocoScope('system');
const routeStateComponent = () =>
  import('./pages/route-state/route-state').then(({ RouteState }) => RouteState);

export const systemRoutes: Routes = [
  {
    path: 'status',
    providers: systemTranslations,
    children: [
      { path: 'forbidden', data: { kind: 'forbidden' }, loadComponent: routeStateComponent },
      { path: 'offline', data: { kind: 'offline' }, loadComponent: routeStateComponent },
      { path: 'server-error', data: { kind: 'serverError' }, loadComponent: routeStateComponent },
    ],
  },
];

export const systemNotFoundRoute: Route = {
  path: '**',
  providers: systemTranslations,
  data: { kind: 'notFound' },
  loadComponent: routeStateComponent,
};
