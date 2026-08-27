import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';

@Component({
  selector: 'app-workspace-settings-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './workspace-settings-layout.html',
  styleUrl: './workspace-settings-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSettingsLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceSession = inject(WorkspaceSession);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly workspaceName = computed(
    () => this.workspaceSession.organization()?.name ?? this.workspaceSlug,
  );
}
