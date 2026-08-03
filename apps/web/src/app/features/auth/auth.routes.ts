import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const authTranslations = provideTranslocoScope('auth');
const workspaceTranslations = provideTranslocoScope('workspace');

export const authRoutes: Routes = [
  {
    path: 'auth/login',
    providers: authTranslations,
    loadComponent: () => import('./pages/login/login').then(({ Login }) => Login),
  },
  {
    path: 'auth/signup',
    providers: authTranslations,
    loadComponent: () => import('./pages/signup/signup').then(({ Signup }) => Signup),
  },
  {
    path: 'auth/verify',
    providers: authTranslations,
    loadComponent: () => import('./pages/verify/verify').then(({ VerifyEmail }) => VerifyEmail),
  },
  {
    path: 'auth/forgot',
    providers: authTranslations,
    loadComponent: () =>
      import('./pages/forgot/forgot').then(({ ForgotPassword }) => ForgotPassword),
  },
  {
    path: 'auth/reset',
    providers: authTranslations,
    loadComponent: () => import('./pages/reset/reset').then(({ ResetPassword }) => ResetPassword),
  },
  {
    path: 'auth/workspace',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/workspace-create/workspace-create').then(
        ({ WorkspaceCreate }) => WorkspaceCreate,
      ),
  },
  {
    path: 'auth/workspaces',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./pages/workspace-list/workspace-list').then(({ WorkspaceList }) => WorkspaceList),
  },
];
