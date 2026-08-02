import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@caselog/schemas';

const TRANSLATED_ERROR_KEYS = new Set([
  'errors.email_already_registered',
  'errors.email_verification_required',
  'errors.http_error',
  'errors.internal_error',
  'errors.insufficient_permissions',
  'errors.invalid_credentials',
  'errors.invalid_or_expired_token',
  'errors.invalid_session',
  'errors.not_found',
  'errors.rate_limited',
  'errors.validation_failed',
  'errors.workspace_limit_reached',
  'errors.workspace_slug_taken',
]);

export function apiErrorTranslationKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const parsed = apiErrorSchema.safeParse(error.error);
    const translationKey = parsed.success ? `errors.${parsed.data.error.code}` : null;
    if (translationKey && TRANSLATED_ERROR_KEYS.has(translationKey)) {
      return translationKey;
    }
  }

  return 'errors.default';
}
