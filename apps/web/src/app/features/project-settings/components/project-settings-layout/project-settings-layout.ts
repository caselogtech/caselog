import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { labelFromSlug } from '../../../../shared/models/slug-label';
import { Breadcrumbs } from '../../../../shared/ui/public-api';
import { ProjectSettingsApi } from '../../data-access/project-settings-api';

@Component({
  selector: 'app-project-settings-layout',
  imports: [Breadcrumbs, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './project-settings-layout.html',
  styleUrl: './project-settings-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly settingsApi = inject(ProjectSettingsApi);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly projectSlug = computed(() => this.routeParams().get('project') ?? '');
  readonly settings = injectQuery(() => ({
    queryKey: ['project-settings', this.workspaceSlug(), this.projectSlug()],
    queryFn: () => this.settingsApi.get(this.workspaceSlug(), this.projectSlug()),
    enabled: Boolean(this.workspaceSlug() && this.projectSlug()),
    retry: false,
  }));
  readonly projectName = computed(
    () => this.settings.data()?.project.name ?? labelFromSlug(this.projectSlug()),
  );
}
