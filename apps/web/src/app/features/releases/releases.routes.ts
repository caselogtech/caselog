import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { requireWorkspacePermission } from '../workspace/public-api';

const releasesTranslations = provideTranslocoScope('releases');

export const releasesRoutes: Routes = [
  {
    path: '',
    providers: releasesTranslations,
    children: [
      {
        path: 'new',
        canActivate: [requireWorkspacePermission('lead')],
        loadComponent: () =>
          import('./pages/release-create/release-create').then(
            ({ ReleaseCreate }) => ReleaseCreate,
          ),
      },
      {
        path: ':releaseId/candidates/new',
        canActivate: [requireWorkspacePermission('lead')],
        loadComponent: () =>
          import('./pages/candidate-create/candidate-create').then(
            ({ CandidateCreate }) => CandidateCreate,
          ),
      },
      {
        path: ':releaseId/candidates/:candidateId',
        loadChildren: () =>
          import('../readiness/public-api').then(({ readinessRoutes }) => readinessRoutes),
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
