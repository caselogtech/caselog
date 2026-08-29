import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
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
import { InstanceCapabilities } from '../../../../core/instance/instance-capabilities';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { BrandMark, Button } from '../../../../shared/ui/public-api';
import { AuthApi } from '../../../auth/public-api';
import { ContextSwitchers } from '../context-switchers/context-switchers';

@Component({
  selector: 'app-workspace-shell',
  imports: [
    BrandMark,
    Button,
    ContextSwitchers,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  templateUrl: './workspace-shell.html',
  styleUrl: './workspace-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceShell {
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApi);
  readonly browserSession = inject(BrowserSession);
  readonly capabilities = inject(InstanceCapabilities);
  readonly workspaceSession = inject(WorkspaceSession);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly navigation = viewChild<ElementRef<HTMLElement>>('navigation');
  private readonly navigationToggle = viewChild<ElementRef<HTMLButtonElement>>('navigationToggle');
  private readonly accountMenu = viewChild<ElementRef<HTMLDetailsElement>>('accountMenu');
  private readonly accountSummary = viewChild<ElementRef<HTMLElement>>('accountSummary');

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly navigationOpen = signal(false);
  readonly signingOut = signal(false);
  readonly signOutErrorKey = signal<string | null>(null);
  readonly projectSlug = computed(() => {
    const segments = this.currentUrl().split('?')[0]?.split('/').filter(Boolean) ?? [];
    const project = segments[1];
    return project && !['projects', 'settings'].includes(project)
      ? decodeURIComponent(project)
      : '';
  });
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
  readonly roleLabelKey = computed(
    () => `workspace.roles.${this.workspaceSession.role() ?? 'read_only'}`,
  );

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

  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.signOutErrorKey.set(null);
    try {
      await this.authApi.logout();
      this.workspaceSession.clear();
      this.browserSession.clear();
      await this.router.navigateByUrl('/auth/login');
    } catch (error) {
      this.signOutErrorKey.set(apiErrorTranslationKey(error));
    } finally {
      this.signingOut.set(false);
    }
  }

  closeAccountMenu(restoreFocus = false): void {
    const menu = this.accountMenu()?.nativeElement;
    if (!menu?.open) return;
    menu.open = false;
    if (restoreFocus) this.accountSummary()?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  closeAccountMenuFromOutsideClick(event: MouseEvent): void {
    const menu = this.accountMenu()?.nativeElement;
    if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
      this.closeAccountMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeOverlaysFromKeyboard(): void {
    if (this.navigationOpen()) this.closeNavigation();
    else this.closeAccountMenu(true);
  }
}
