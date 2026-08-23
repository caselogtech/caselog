import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const workspaceTranslations = provideTranslocoScope('workspace');

export const workspaceRoutes: Routes = [
  {
    path: ':org',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./components/workspace-shell/workspace-shell').then(
        ({ WorkspaceShell }) => WorkspaceShell,
      ),
    children: [
      {
        path: ':project/imports',
        loadComponent: () =>
          import('./pages/automation/ci-imports').then(({ CiImports }) => CiImports),
      },
      {
        path: ':project/runs/new',
        loadComponent: () => import('./pages/runs/run-create').then(({ RunCreate }) => RunCreate),
      },
      {
        path: ':project/runs/:runId/items/:itemId/results/:resultId',
        loadComponent: () =>
          import('./pages/runs/result-detail').then(({ ResultDetail }) => ResultDetail),
      },
      {
        path: ':project/runs/:runId/items/:itemId/results',
        loadComponent: () =>
          import('./pages/runs/result-history').then(({ ResultHistory }) => ResultHistory),
      },
      {
        path: ':project/runs/:runId',
        loadComponent: () => import('./pages/runs/run-detail').then(({ RunDetail }) => RunDetail),
      },
      {
        path: ':project/runs',
        loadComponent: () => import('./pages/runs/run-list').then(({ RunList }) => RunList),
      },
      {
        path: ':project/cases/new',
        loadComponent: () =>
          import('./pages/cases/case-create').then(({ CaseCreate }) => CaseCreate),
      },
      {
        path: ':project/cases/:caseId',
        loadComponent: () =>
          import('./pages/cases/case-detail').then(({ CaseDetail }) => CaseDetail),
      },
      {
        path: ':project/cases',
        loadComponent: () => import('./pages/cases/case-list').then(({ CaseList }) => CaseList),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./pages/projects/project-list').then(({ ProjectList }) => ProjectList),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/home/workspace-home').then(({ WorkspaceHome }) => WorkspaceHome),
      },
    ],
  },
];
