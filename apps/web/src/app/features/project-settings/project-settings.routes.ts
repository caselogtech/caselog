import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const projectSettingsTranslations = provideTranslocoScope('projectSettings');

export const projectSettingsRoutes: Routes = [
  {
    path: '',
    providers: projectSettingsTranslations,
    loadComponent: () =>
      import('./components/project-settings-layout/project-settings-layout').then(
        ({ ProjectSettingsLayout }) => ProjectSettingsLayout,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'general' },
      {
        path: 'general',
        loadComponent: () =>
          import('./pages/general/project-general-settings').then(
            ({ ProjectGeneralSettings }) => ProjectGeneralSettings,
          ),
      },
      {
        path: 'environments',
        loadComponent: () =>
          import('./pages/environments/environment-settings').then(
            ({ EnvironmentSettings }) => EnvironmentSettings,
          ),
      },
    ],
  },
];
