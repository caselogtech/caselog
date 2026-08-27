import type { Routes } from '@angular/router';
import { runCreatePendingChangesGuard } from './pages/run-create/run-create.guard';

export const testRunsRoutes: Routes = [
  {
    path: 'new',
    canDeactivate: [runCreatePendingChangesGuard],
    loadComponent: () => import('./pages/run-create/run-create').then(({ RunCreate }) => RunCreate),
  },
  {
    path: ':runId/items/:itemId/results/:resultId',
    loadComponent: () =>
      import('./pages/result-detail/result-detail').then(({ ResultDetail }) => ResultDetail),
  },
  {
    path: ':runId/items/:itemId/results',
    loadComponent: () =>
      import('./pages/result-history/result-history').then(({ ResultHistory }) => ResultHistory),
  },
  {
    path: ':runId',
    loadComponent: () => import('./pages/run-detail/run-detail').then(({ RunDetail }) => RunDetail),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/run-list/run-list').then(({ RunList }) => RunList),
  },
];
