import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { labelFromSlug } from '../../../../shared/models/slug-label';
import { Breadcrumbs } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-workspace-settings-layout',
  imports: [Breadcrumbs, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './workspace-settings-layout.html',
  styleUrl: './workspace-settings-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSettingsLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly workspaceName = computed(() => {
    const slug = this.workspaceSlug();
    return this.workspaceSession.organization()?.slug === slug
      ? (this.workspaceSession.organization()?.name ?? labelFromSlug(slug))
      : labelFromSlug(slug);
  });
}
