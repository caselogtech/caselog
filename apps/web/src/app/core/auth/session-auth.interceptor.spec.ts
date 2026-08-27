import { usesBrowserSession } from './session-auth.interceptor';

describe('usesBrowserSession', () => {
  it.each(['/api/v1/auth/login', '/api/v1/auth/workspaces', '/api/v1/invitations/token/accept'])(
    'uses the browser session for %s',
    (url) => expect(usesBrowserSession(url)).toBe(true),
  );

  it.each(['/api/v1/members', '/api/v1/members/invitations', '/api/v1/releases'])(
    'keeps workspace APIs on the organization session for %s',
    (url) => expect(usesBrowserSession(url)).toBe(false),
  );
});
