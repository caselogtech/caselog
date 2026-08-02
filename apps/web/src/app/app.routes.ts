import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const authTranslations = provideTranslocoScope('auth');
const workspaceTranslations = provideTranslocoScope('workspace');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  {
    path: 'auth/login',
    providers: authTranslations,
    loadComponent: () => import('./features/auth/login/login').then(({ Login }) => Login),
  },
  {
    path: 'auth/signup',
    providers: authTranslations,
    loadComponent: () => import('./features/auth/signup/signup').then(({ Signup }) => Signup),
  },
  {
    path: 'auth/verify',
    providers: authTranslations,
    loadComponent: () =>
      import('./features/auth/verify/verify').then(({ VerifyEmail }) => VerifyEmail),
  },
  {
    path: 'auth/forgot',
    providers: authTranslations,
    loadComponent: () =>
      import('./features/auth/forgot/forgot').then(({ ForgotPassword }) => ForgotPassword),
  },
  {
    path: 'auth/reset',
    providers: authTranslations,
    loadComponent: () =>
      import('./features/auth/reset/reset').then(({ ResetPassword }) => ResetPassword),
  },
  {
    path: 'auth/workspace',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/auth/workspace/workspace-create').then(
        ({ WorkspaceCreate }) => WorkspaceCreate,
      ),
  },
  {
    path: 'auth/workspaces',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/auth/workspaces/workspace-list').then(
        ({ WorkspaceList }) => WorkspaceList,
      ),
  },
  {
    path: ':org/:project/runs/new',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/runs/run-create').then(({ RunCreate }) => RunCreate),
  },
  {
    path: ':org/:project/runs/:runId',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/runs/run-detail').then(({ RunDetail }) => RunDetail),
  },
  {
    path: ':org/:project/runs',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/runs/run-list').then(({ RunList }) => RunList),
  },
  {
    path: ':org/:project/cases/new',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/cases/case-create').then(({ CaseCreate }) => CaseCreate),
  },
  {
    path: ':org/:project/cases/:caseId',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/cases/case-detail').then(({ CaseDetail }) => CaseDetail),
  },
  {
    path: ':org/:project/cases',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/cases/case-list').then(({ CaseList }) => CaseList),
  },
  {
    path: ':org/projects',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/projects/project-list').then(({ ProjectList }) => ProjectList),
  },
  {
    path: ':org',
    providers: workspaceTranslations,
    loadComponent: () =>
      import('./features/workspace/workspace-home').then(({ WorkspaceHome }) => WorkspaceHome),
  },
  { path: '**', redirectTo: 'auth/login' },
];
