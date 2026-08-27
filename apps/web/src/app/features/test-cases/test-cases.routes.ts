import type { Routes } from '@angular/router';
import { caseCreatePendingChangesGuard } from './pages/case-create/case-create.guard';

export const testCasesRoutes: Routes = [
  {
    path: 'import',
    loadComponent: () => import('./pages/csv-import/csv-import').then(({ CsvImport }) => CsvImport),
  },
  {
    path: 'new',
    canDeactivate: [caseCreatePendingChangesGuard],
    loadComponent: () =>
      import('./pages/case-create/case-create').then(({ CaseCreate }) => CaseCreate),
  },
  {
    path: ':caseId',
    loadComponent: () =>
      import('./pages/case-detail/case-detail').then(({ CaseDetail }) => CaseDetail),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/case-list/case-list').then(({ CaseList }) => CaseList),
  },
];
