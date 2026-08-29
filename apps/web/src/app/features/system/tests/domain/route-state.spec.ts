import { routeStateKind, safeReturnUrl } from '../../domain/route-state';

describe('route state', () => {
  it('accepts known states and falls back to not found', () => {
    expect(routeStateKind('forbidden')).toBe('forbidden');
    expect(routeStateKind('offline')).toBe('offline');
    expect(routeStateKind('unexpected')).toBe('notFound');
  });

  it('accepts only internal return URLs outside the status routes', () => {
    expect(safeReturnUrl('/acme/checkout/releases?state=active')).toBe(
      '/acme/checkout/releases?state=active',
    );
    expect(safeReturnUrl('https://example.com')).toBeNull();
    expect(safeReturnUrl('//example.com')).toBeNull();
    expect(safeReturnUrl('/status/server-error')).toBeNull();
  });
});
