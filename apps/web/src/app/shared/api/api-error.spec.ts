import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorCode, apiErrorTranslationKey } from './api-error';

describe('apiErrorTranslationKey', () => {
  it('maps a supported API error code to a translation key', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        error: {
          code: 'workspace_slug_taken',
          message: 'Server fallback message',
          details: {},
          requestId: 'request-1',
        },
      },
    });

    expect(apiErrorTranslationKey(error)).toBe('errors.workspace_slug_taken');
    expect(apiErrorCode(error)).toBe('workspace_slug_taken');
  });

  it('does not display an unknown server message', () => {
    const error = new HttpErrorResponse({
      status: 418,
      error: {
        error: {
          code: 'unexpected_remote_code',
          message: 'Untrusted server message',
          details: {},
          requestId: 'request-2',
        },
      },
    });

    expect(apiErrorTranslationKey(error)).toBe('errors.default');
  });
});
