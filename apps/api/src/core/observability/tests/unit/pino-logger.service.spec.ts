import { describe, expect, it } from 'vitest';
import { sanitizeLogValue } from '../../infrastructure/logging/pino-logger.service';

describe('structured log redaction', () => {
  it('recursively removes secrets, attachment metadata, and personal data', () => {
    expect(
      sanitizeLogValue({
        event: 'auth.failed',
        authorization: 'Bearer secret',
        accessToken: 'access-token',
        user: { email: 'person@example.com', displayName: 'Person' },
        request: { password: 'password', token: 'token', fileName: 'failure.png' },
      }),
    ).toEqual({
      event: 'auth.failed',
      authorization: '[REDACTED]',
      accessToken: '[REDACTED]',
      user: { email: '[REDACTED]', displayName: '[REDACTED]' },
      request: { password: '[REDACTED]', token: '[REDACTED]', fileName: '[REDACTED]' },
    });
  });
});
