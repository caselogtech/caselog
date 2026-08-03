import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';

@Component({
  selector: 'app-workspace-home',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './workspace-home.html',
  styleUrl: './workspace-home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceHome {
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly route = inject(ActivatedRoute);
  readonly slug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly roleTranslationKey = workspaceRoleTranslationKey;

  readonly workspace = injectQuery(() => ({
    queryKey: ['workspace-session', this.slug],
    queryFn: () => this.workspaceApi.open(this.slug),
    retry: false,
  }));

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.workspace.error());
  }
}
