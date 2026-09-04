import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { staffAccessGuard } from './routing/staff-access.guard';

const staffTranslations = provideTranslocoScope('staff');
const directoryPage = () =>
  import('./pages/directory/staff-directory').then(({ StaffDirectory }) => StaffDirectory);

export const staffRoutes: Routes = [
  {
    path: 'staff',
    providers: staffTranslations,
    canActivate: [staffAccessGuard],
    loadComponent: () =>
      import('./components/staff-shell/staff-shell').then(({ StaffShell }) => StaffShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/overview/staff-overview').then(({ StaffOverview }) => StaffOverview),
      },
      { path: 'users', data: { resource: 'users' }, loadComponent: directoryPage },
      {
        path: 'workspaces',
        data: { resource: 'workspaces' },
        loadComponent: directoryPage,
      },
      {
        path: 'billing-accounts',
        data: { resource: 'billingAccounts' },
        loadComponent: directoryPage,
      },
      {
        path: 'operators',
        loadComponent: () =>
          import('./pages/operators/staff-operators').then(({ StaffOperators }) => StaffOperators),
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./pages/audit/staff-audit').then(({ StaffAudit }) => StaffAudit),
      },
    ],
  },
];
