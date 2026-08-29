import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteFailureRedirect } from './route-failure-redirect';

describe('RouteFailureRedirect', () => {
  const navigate = vi.fn().mockResolvedValue(true);
  const router = { navigate, url: '/acme/checkout/releases/release-1' };

  beforeEach(() => {
    navigate.mockClear();
    router.url = '/acme/checkout/releases/release-1';
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }],
    });
  });

  it('redirects classified failures while preserving a safe retry URL', () => {
    const redirect = TestBed.inject(RouteFailureRedirect);

    expect(redirect.handle(new HttpErrorResponse({ status: 403 }))).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/status', 'forbidden'], {
      queryParams: { returnUrl: '/acme/checkout/releases/release-1' },
      replaceUrl: true,
    });
  });

  it('keeps validation and conflict errors on the current page', () => {
    const redirect = TestBed.inject(RouteFailureRedirect);

    expect(redirect.handle(new HttpErrorResponse({ status: 409 }))).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect recursively from a system-state route', () => {
    router.url = '/status/offline';
    const redirect = TestBed.inject(RouteFailureRedirect);

    expect(redirect.handle(new HttpErrorResponse({ status: 0 }))).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
