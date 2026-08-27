import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const projectSettingsTranslations = provideTranslocoScope('projectSettings');

export const projectSettingsRoutes: Routes = [
  {
    path: '',
    providers: projectSettingsTranslations,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'environments' },
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
