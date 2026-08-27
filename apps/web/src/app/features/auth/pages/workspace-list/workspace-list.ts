import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { InstanceCapabilities } from '../../../../core/instance/instance-capabilities';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';
import { AuthApi } from '../../data-access/auth-api';

@Component({
  selector: 'app-workspace-list',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './workspace-list.html',
  styleUrl: '../../components/workspace-onboarding.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceList {
  private readonly authApi = inject(AuthApi);
  private readonly queryClient = inject(QueryClient);
  readonly capabilities = inject(InstanceCapabilities);

  readonly workspaces = injectQuery(() => ({
    queryKey: ['workspaces', 'active'],
    queryFn: () => this.authApi.listWorkspaces('active'),
  }));
  readonly deletedWorkspaces = injectQuery(() => ({
    queryKey: ['workspaces', 'deleted'],
    queryFn: () => this.authApi.listWorkspaces('deleted'),
  }));
  readonly restoreWorkspace = injectMutation(() => ({
    mutationFn: (workspaceId: string) => this.authApi.restoreWorkspace(workspaceId),
    onSuccess: () => this.queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  }));
  readonly roleTranslationKey = workspaceRoleTranslationKey;

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.workspaces.error());
  }

  restoreErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.restoreWorkspace.error() ?? this.deletedWorkspaces.error());
  }

  formatRecoveryUntil(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}
