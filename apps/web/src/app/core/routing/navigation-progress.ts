import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

const DISPLAY_DELAY_MS = 120;

@Injectable({ providedIn: 'root' })
export class NavigationProgress {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private displayTimer: ReturnType<typeof setTimeout> | undefined;

  readonly visible = signal(false);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.scheduleDisplay();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.hide();
      }
    });
  }

  private scheduleDisplay(): void {
    clearTimeout(this.displayTimer);
    this.displayTimer = setTimeout(() => this.visible.set(true), DISPLAY_DELAY_MS);
  }

  private hide(): void {
    clearTimeout(this.displayTimer);
    this.displayTimer = undefined;
    this.visible.set(false);
  }
}
