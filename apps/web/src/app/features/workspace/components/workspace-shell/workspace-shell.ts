import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly browserSession = inject(BrowserSession);
  readonly workspaceSession = inject(WorkspaceSession);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly navigation = viewChild<ElementRef<HTMLElement>>('navigation');
  private readonly navigationToggle = viewChild<ElementRef<HTMLButtonElement>>('navigationToggle');

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly navigationOpen = signal(false);
  readonly projectSlug = computed(() => {
    const segments = this.currentUrl().split('?')[0]?.split('/').filter(Boolean) ?? [];
    const project = segments[1];
    return project && project !== 'projects' ? decodeURIComponent(project) : '';
  });
  readonly workspaceName = computed(
    () => this.workspaceSession.organization()?.name ?? this.workspaceSlug,
  );
  readonly projectName = computed(() =>
    this.projectSlug()
      .split('-')
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' '),
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

  constructor() {
    effect((onCleanup) => {
      if (!this.navigationOpen()) return;
      const previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      queueMicrotask(() => this.navigation()?.nativeElement.focus());
      onCleanup(() => {
        this.document.body.style.overflow = previousOverflow;
      });
    });
  }

  openNavigation(): void {
    this.navigationOpen.set(true);
  }

  closeNavigation(restoreFocus = true): void {
    if (!this.navigationOpen()) return;
    this.navigationOpen.set(false);
    if (restoreFocus) queueMicrotask(() => this.navigationToggle()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closeNavigationFromKeyboard(): void {
    this.closeNavigation();
  }
}
