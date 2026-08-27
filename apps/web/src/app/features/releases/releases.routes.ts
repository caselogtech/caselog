import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const releasesTranslations = provideTranslocoScope('releases');

export const releasesRoutes: Routes = [
  {
    path: '',
    providers: releasesTranslations,
    children: [
      {
        path: 'new',
        loadComponent: () =>
          import('./pages/release-create/release-create').then(
            ({ ReleaseCreate }) => ReleaseCreate,
          ),
      },
      {
        path: ':releaseId',
        loadComponent: () =>
          import('./pages/release-detail/release-detail').then(
            ({ ReleaseDetail }) => ReleaseDetail,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/release-list/release-list').then(({ ReleaseList }) => ReleaseList),
      },
    ],
  },
];
