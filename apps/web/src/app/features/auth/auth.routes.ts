import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const authTranslations = provideTranslocoScope('auth');
const workspaceTranslations = provideTranslocoScope('workspace');

export const authRoutes: Routes = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./components/auth-shell/auth-shell').then(({ AuthShell }) => AuthShell),
    children: [
      {
        path: 'login',
        providers: authTranslations,
        loadComponent: () => import('./pages/login/login').then(({ Login }) => Login),
      },
      {
        path: 'signup',
        providers: authTranslations,
        loadComponent: () => import('./pages/signup/signup').then(({ Signup }) => Signup),
      },
      {
        path: 'verify',
        providers: authTranslations,
        loadComponent: () => import('./pages/verify/verify').then(({ VerifyEmail }) => VerifyEmail),
      },
      {
        path: 'forgot',
        providers: authTranslations,
        loadComponent: () =>
          import('./pages/forgot/forgot').then(({ ForgotPassword }) => ForgotPassword),
      },
      {
        path: 'reset',
        providers: authTranslations,
        loadComponent: () =>
          import('./pages/reset/reset').then(({ ResetPassword }) => ResetPassword),
      },
      {
        path: 'workspace',
        providers: workspaceTranslations,
        loadComponent: () =>
          import('./pages/workspace-create/workspace-create').then(
            ({ WorkspaceCreate }) => WorkspaceCreate,
          ),
      },
      {
        path: 'workspaces',
        providers: workspaceTranslations,
        loadComponent: () =>
          import('./pages/workspace-list/workspace-list').then(
            ({ WorkspaceList }) => WorkspaceList,
          ),
      },
    ],
  },
];
