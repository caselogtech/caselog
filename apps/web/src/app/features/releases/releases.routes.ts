import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

export const releasesRoutes: Routes = [
  {
    path: '',
    providers: provideTranslocoScope('releases'),
    loadComponent: () =>
      import('./pages/release-list/release-list').then(({ ReleaseList }) => ReleaseList),
  },
];
