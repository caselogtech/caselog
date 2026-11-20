import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { staffDirectoryReturnUrl } from '../domain/staff-directory-navigation';

export function injectStaffDirectoryReturn(fallback: '/staff/users' | '/staff/workspaces') {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const params = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });
  const origin = computed(() => staffDirectoryReturnUrl(params()?.get('returnTo') ?? null));
  const href = computed(() => origin() ?? fallback);
  const link = computed(() => router.parseUrl(href()));
  const queryParams = computed(() => (origin() ? { returnTo: origin() } : null));
  return { origin, href, link, queryParams };
}
