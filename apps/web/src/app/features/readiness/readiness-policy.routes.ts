import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { requireWorkspacePermission } from '../workspace/public-api';

const readinessTranslations = provideTranslocoScope('readiness');

export const readinessPolicyRoutes: Routes = [
  {
    path: '',
    providers: readinessTranslations,
    children: [
      {
        path: 'new',
        canActivate: [requireWorkspacePermission('lead')],
        loadComponent: () =>
          import('./pages/policy-create/policy-create').then(
            ({ ReadinessPolicyCreate }) => ReadinessPolicyCreate,
          ),
      },
      {
        path: ':policyId/versions/new',
        canActivate: [requireWorkspacePermission('lead')],
        loadComponent: () =>
          import('./pages/policy-version-create/policy-version-create').then(
            ({ ReadinessPolicyVersionCreate }) => ReadinessPolicyVersionCreate,
          ),
      },
      {
        path: ':policyId',
        loadComponent: () =>
          import('./pages/policy-detail/policy-detail').then(
            ({ ReadinessPolicyDetail }) => ReadinessPolicyDetail,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/policy-list/policy-list').then(
            ({ ReadinessPolicyList }) => ReadinessPolicyList,
          ),
      },
    ],
  },
];
