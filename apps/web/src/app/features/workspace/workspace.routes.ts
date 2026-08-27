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
        path: ':project/releases',
        loadChildren: () =>
          import('../releases/public-api').then(({ releasesRoutes }) => releasesRoutes),
      },
      {
        path: ':project/settings',
        loadChildren: () =>
          import('../project-settings/public-api').then(
            ({ projectSettingsRoutes }) => projectSettingsRoutes,
          ),
      },
      {
        path: ':project/imports',
        loadChildren: () =>
          import('../ci-imports/public-api').then(({ ciImportsRoutes }) => ciImportsRoutes),
      },
      {
        path: ':project/runs',
        loadChildren: () =>
          import('../test-runs/public-api').then(({ testRunsRoutes }) => testRunsRoutes),
      },
      {
        path: ':project/cases',
        loadChildren: () =>
          import('../test-cases/public-api').then(({ testCasesRoutes }) => testCasesRoutes),
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
