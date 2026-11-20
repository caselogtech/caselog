import {
  staffDirectoryReturnUrl,
  staffDirectoryUrl,
} from '../../domain/staff-directory-navigation';

describe('staff directory return links', () => {
  it('canonicalizes supported directory filters and preserves pagination', () => {
    expect(
      staffDirectoryReturnUrl(
        '/staff/workspaces?limit=1&state=current&q=owner&cursor=11111111-1111-4111-8111-111111111111',
      ),
    ).toBe(
      '/staff/workspaces?q=owner&state=current&limit=1&cursor=11111111-1111-4111-8111-111111111111',
    );
    expect(staffDirectoryReturnUrl('/staff/users?q=owner&returnTo=https://example.com')).toBe(
      '/staff/users?q=owner',
    );
    expect(staffDirectoryUrl('billingAccounts', { limit: 25, state: 'all' })).toBe(
      '/staff/billing-accounts',
    );
  });
  it.each([
    'https://example.com',
    '//example.com/staff/users',
    '/staff/\\example.com',
    '/acme/projects',
    '/staff/users/123',
    '/staff/users?cursor=invalid',
    '/staff/users?limit=101',
    '/staff/workspaces?state=invalid',
    '/staff/users#fragment',
    '/staff/users?q=x',
    `/staff/users?q=${'x'.repeat(2050)}`,
  ])('rejects unsafe or malformed return destination %s', (value) => {
    expect(staffDirectoryReturnUrl(value)).toBeUndefined();
  });
});
