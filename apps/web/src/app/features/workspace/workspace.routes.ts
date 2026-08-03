import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const workspaceTranslations = provideTranslocoScope('workspace');

export const workspaceRoutes: Routes = [
  {
    path: ':org/:project/runs/new',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/runs/run-create').then(({ RunCreate }) => RunCreate),
  },
  {
    path: ':org/:project/runs/:runId/items/:itemId/results/:resultId',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/runs/result-detail').then(({ ResultDetail }) => ResultDetail),
  },
  {
    path: ':org/:project/runs/:runId/items/:itemId/results',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/runs/result-history').then(({ ResultHistory }) => ResultHistory),
  },
  {
    path: ':org/:project/runs/:runId',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/runs/run-detail').then(({ RunDetail }) => RunDetail),
  },
  {
    path: ':org/:project/runs',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/runs/run-list').then(({ RunList }) => RunList),
  },
  {
    path: ':org/:project/cases/new',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/cases/case-create').then(({ CaseCreate }) => CaseCreate),
  },
  {
    path: ':org/:project/cases/:caseId',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/cases/case-detail').then(({ CaseDetail }) => CaseDetail),
  },
  {
    path: ':org/:project/cases',
    providers: workspaceTranslations,
    loadComponent: () => import('./pages/cases/case-list').then(({ CaseList }) => CaseList),
  },
  {
    path: ':org/projects',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/projects/project-list').then(({ ProjectList }) => ProjectList),
  },
  {
    path: ':org',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/home/workspace-home').then(({ WorkspaceHome }) => WorkspaceHome),
  },
];
