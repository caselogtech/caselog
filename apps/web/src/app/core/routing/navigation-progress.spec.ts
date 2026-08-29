import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NavigationProgress } from './navigation-progress';

describe('NavigationProgress', () => {
  const events = new Subject<unknown>();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events } }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows delayed progress for long navigation and hides it on completion', () => {
    vi.useFakeTimers();
    const progress = TestBed.inject(NavigationProgress);

    events.next(new NavigationStart(1, '/acme/checkout/releases'));
    vi.advanceTimersByTime(119);
    expect(progress.visible()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(progress.visible()).toBe(true);

    events.next(new NavigationEnd(1, '/acme/checkout/releases', '/acme/checkout/releases'));
    expect(progress.visible()).toBe(false);
  });

  it('does not flash progress when navigation completes inside the delay', () => {
    vi.useFakeTimers();
    const progress = TestBed.inject(NavigationProgress);

    events.next(new NavigationStart(2, '/auth/login'));
    events.next(new NavigationEnd(2, '/auth/login', '/auth/login'));
    vi.runAllTimers();

    expect(progress.visible()).toBe(false);
  });
});
