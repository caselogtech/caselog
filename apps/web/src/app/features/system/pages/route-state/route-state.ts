import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { BrandMark, Button } from '../../../../shared/ui/public-api';
import { type RouteStateKind, routeStateKind, safeReturnUrl } from '../../domain/route-state';

const RETRYABLE_STATES = new Set<RouteStateKind>(['offline', 'serverError']);

@Component({
  selector: 'app-route-state',
  imports: [BrandMark, Button, RouterLink, TranslocoPipe],
  templateUrl: './route-state.html',
  styleUrl: './route-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteState {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browserSession = inject(BrowserSession);
  private readonly routeData = this.route.snapshot.data as { kind?: unknown };

  readonly kind = routeStateKind(this.routeData.kind);
  readonly translationPrefix = `system.states.${this.kind}`;
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  readonly retryable = RETRYABLE_STATES.has(this.kind);
  readonly safeDestination = computed(() =>
    this.browserSession.user() ? '/auth/workspaces' : '/auth/login',
  );
  readonly destinationLabelKey = computed(() =>
    this.browserSession.user() ? 'system.actions.workspaces' : 'system.actions.signIn',
  );

  recover(): Promise<boolean> {
    return this.router.navigateByUrl(this.returnUrl ?? this.safeDestination());
  }
}
