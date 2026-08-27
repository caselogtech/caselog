import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { BrandMark } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-workspace-shell',
  imports: [BrandMark, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './workspace-shell.html',
  styleUrl: './workspace-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceShell {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browserSession = inject(BrowserSession);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = computed(() => {
    const segments = this.currentUrl().split('?')[0]?.split('/').filter(Boolean) ?? [];
    const project = segments[1];
    return project && project !== 'projects' ? decodeURIComponent(project) : '';
  });
  readonly workspaceName = computed(
    () => this.workspaceSession.organization()?.name ?? this.workspaceSlug,
  );
  readonly displayName = computed(
    () => this.browserSession.user()?.displayName || this.browserSession.user()?.email || '',
  );
  readonly initials = computed(() => {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'CL';
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  });
}
