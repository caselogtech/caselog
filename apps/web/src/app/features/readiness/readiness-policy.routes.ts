import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const readinessTranslations = provideTranslocoScope('readiness');

export const readinessPolicyRoutes: Routes = [
  {
    path: '',
    providers: readinessTranslations,
    children: [
      {
        path: 'new',
        loadComponent: () =>
          import('./pages/policy-create/policy-create').then(
            ({ ReadinessPolicyCreate }) => ReadinessPolicyCreate,
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
