import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login').then(({ Login }) => Login),
  },
  {
    path: 'auth/signup',
    loadComponent: () => import('./features/auth/signup/signup').then(({ Signup }) => Signup),
  },
  {
    path: 'auth/verify',
    loadComponent: () =>
      import('./features/auth/verify/verify').then(({ VerifyEmail }) => VerifyEmail),
  },
  {
    path: 'auth/forgot',
    loadComponent: () =>
      import('./features/auth/forgot/forgot').then(({ ForgotPassword }) => ForgotPassword),
  },
  {
    path: 'auth/reset',
    loadComponent: () =>
      import('./features/auth/reset/reset').then(({ ResetPassword }) => ResetPassword),
  },
  {
    path: 'auth/workspace',
    loadComponent: () =>
      import('./features/auth/auth-placeholder').then(({ AuthPlaceholder }) => AuthPlaceholder),
  },
  {
    path: 'auth/workspaces',
    loadComponent: () =>
      import('./features/auth/auth-placeholder').then(({ AuthPlaceholder }) => AuthPlaceholder),
  },
  { path: '**', redirectTo: 'auth/login' },
];
