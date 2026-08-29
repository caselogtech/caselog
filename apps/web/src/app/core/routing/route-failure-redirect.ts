import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { routeFailurePath, routeFailureState } from './route-failure';

@Injectable({ providedIn: 'root' })
export class RouteFailureRedirect {
  private readonly router = inject(Router);
  private redirectPending = false;

  handle(error: unknown): boolean {
    const state = routeFailureState(error);
    if (!state || this.redirectPending || this.router.url.startsWith('/status/')) return false;

    const returnUrl = this.router.url;
    this.redirectPending = true;
    void this.router
      .navigate(['/status', routeFailurePath(state)], {
        queryParams: { returnUrl },
        replaceUrl: true,
      })
      .finally(() => {
        this.redirectPending = false;
      });
    return true;
  }
}
