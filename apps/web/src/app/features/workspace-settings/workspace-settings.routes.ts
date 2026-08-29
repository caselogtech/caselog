import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { requireWorkspacePermission } from '../workspace/public-api';

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
        path: 'members',
        loadComponent: () =>
          import('./pages/members/workspace-members-settings').then(
            ({ WorkspaceMembersSettings }) => WorkspaceMembersSettings,
          ),
      },
      {
        path: 'audit',
        canActivate: [requireWorkspacePermission('admin')],
        loadComponent: () =>
          import('./pages/audit/workspace-audit-settings').then(
            ({ WorkspaceAuditSettings }) => WorkspaceAuditSettings,
          ),
      },
      {
        path: 'tokens',
        canActivate: [requireWorkspacePermission('admin')],
        loadComponent: () =>
          import('./pages/tokens/workspace-api-tokens-settings').then(
            ({ WorkspaceApiTokensSettings }) => WorkspaceApiTokensSettings,
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
