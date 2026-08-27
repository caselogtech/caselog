import { safeInvitationReturnUrl } from '../../domain/auth-return-url';

const token = `clgi_65f3ec68-2560-46bf-8845-8b10c7ce8ec1_${'a'.repeat(43)}`;

describe('safeInvitationReturnUrl', () => {
  it('accepts an exact local invitation route with a valid opaque token', () => {
    expect(safeInvitationReturnUrl(`/auth/invite/${token}`)).toBe(`/auth/invite/${token}`);
  });

  it.each([
    null,
    '',
    'https://attacker.example/auth/invite/token',
    '//attacker.example/auth/invite/token',
    '/auth/login',
    '/auth/invite/not-a-token',
    `/auth/invite/${token}?next=https://attacker.example`,
  ])('rejects an unsafe or unsupported return URL: %s', (value) => {
    expect(safeInvitationReturnUrl(value)).toBeNull();
  });
});
