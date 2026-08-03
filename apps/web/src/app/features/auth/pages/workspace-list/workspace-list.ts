import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
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

  readonly workspaces = injectQuery(() => ({
    queryKey: ['workspaces'],
    queryFn: () => this.authApi.listWorkspaces(),
  }));
  readonly roleTranslationKey = workspaceRoleTranslationKey;

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.workspaces.error());
  }
}
