import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@caselog/schemas';

const TRANSLATED_ERROR_KEYS = new Set([
  'errors.case_version_conflict',
  'errors.section_name_taken',
  'errors.section_not_empty',
  'errors.section_cycle',
  'errors.suite_name_taken',
  'errors.suite_not_empty',
  'errors.email_already_registered',
  'errors.email_verification_required',
  'errors.empty_csv_import',
  'errors.http_error',
  'errors.internal_error',
  'errors.insufficient_permissions',
  'errors.idempotency_key_reused',
  'errors.invalid_credentials',
  'errors.invalid_csv',
  'errors.invalid_csv_rows',
  'errors.invalid_or_expired_token',
  'errors.invalid_session',
  'errors.not_found',
  'errors.project_has_open_runs',
  'errors.project_key_taken',
  'errors.project_slug_taken',
  'errors.rate_limited',
  'errors.run_case_unavailable',
  'errors.run_closed',
  'errors.invalid_run_state',
  'errors.invalid_step_results',
  'errors.invalid_upload_target',
  'errors.invalid_upload',
  'errors.junit_invalid_testcase',
  'errors.junit_malformed_xml',
  'errors.junit_unsafe_xml',
  'errors.junit_unsupported_root',
  'errors.junit_upload_limit_exceeded',
  'errors.run_status_unavailable',
  'errors.upload_limit_reached',
  'errors.upload_incomplete',
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
