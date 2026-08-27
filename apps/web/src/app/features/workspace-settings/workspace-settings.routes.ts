import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const workspaceSettingsTranslations = provideTranslocoScope('workspaceSettings');

export const workspaceSettingsRoutes: Routes = [
  {
    path: '',
    providers: workspaceSettingsTranslations,
    loadComponent: () =>
      import('./components/workspace-settings-layout/workspace-settings-layout').then(
        ({ WorkspaceSettingsLayout }) => WorkspaceSettingsLayout,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'general' },
      {
        path: 'general',
        loadComponent: () =>
          import('./pages/general/workspace-general-settings').then(
            ({ WorkspaceGeneralSettings }) => WorkspaceGeneralSettings,
          ),
      },
      {
        path: 'danger',
        loadComponent: () =>
          import('./pages/danger/workspace-danger-settings').then(
            ({ WorkspaceDangerSettings }) => WorkspaceDangerSettings,
          ),
      },
    ],
  },
];
