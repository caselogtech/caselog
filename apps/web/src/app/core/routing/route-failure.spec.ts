import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { routeFailurePath, routeFailureState } from './route-failure';

describe('routeFailureState', () => {
  it.each([
    [403, 'forbidden'],
    [404, 'notFound'],
    [0, 'offline'],
    [500, 'serverError'],
    [503, 'serverError'],
  ] as const)('maps HTTP %s to %s', (status, state) => {
    expect(routeFailureState(new HttpErrorResponse({ status }))).toBe(state);
  });

  it('keeps expected client errors local', () => {
    expect(routeFailureState(new HttpErrorResponse({ status: 409 }))).toBeNull();
  });

  it('treats invalid response contracts as a server error', () => {
    expect(routeFailureState(new Error('Invalid response'))).toBe('serverError');
  });
});

describe('routeFailurePath', () => {
  it('maps internal state names to public route segments', () => {
    expect(routeFailurePath('notFound')).toBe('not-found');
    expect(routeFailurePath('serverError')).toBe('server-error');
    expect(routeFailurePath('forbidden')).toBe('forbidden');
  });
});
