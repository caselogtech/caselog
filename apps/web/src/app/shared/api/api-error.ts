import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@caselog/schemas';

const TRANSLATED_ERROR_KEYS = new Set([
  'errors.active_readiness_waiver_exists',
  'errors.case_version_conflict',
  'errors.section_name_taken',
  'errors.section_not_empty',
  'errors.section_cycle',
  'errors.suite_name_taken',
  'errors.suite_not_empty',
  'errors.email_already_registered',
  'errors.email_verification_required',
  'errors.empty_csv_import',
  'errors.environment_archived',
  'errors.environment_has_open_releases',
  'errors.environment_slug_taken',
  'errors.http_error',
  'errors.internal_error',
  'errors.insufficient_permissions',
  'errors.idempotency_conflict',
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
  'errors.readiness_input_superseded',
  'errors.readiness_decision_already_ready',
  'errors.readiness_gate_already_passed',
  'errors.readiness_waiver_already_revoked',
  'errors.readiness_waiver_expired',
  'errors.readiness_waiver_expiry_not_future',
  'errors.release_policy_assignment_changed',
  'errors.release_candidate_identity_taken',
  'errors.release_finalized',
  'errors.release_policy_not_assigned',
  'errors.release_policy_not_published',
  'errors.run_case_unavailable',
  'errors.run_closed',
  'errors.invalid_release_transition',
  'errors.invalid_run_state',
  'errors.invalid_step_results',
  'errors.invalid_upload_target',
  'errors.invalid_upload',
  'errors.junit_invalid_testcase',
  'errors.junit_malformed_xml',
  'errors.junit_unsafe_xml',
  'errors.junit_unsupported_root',
  'errors.junit_upload_limit_exceeded',
  'errors.release_key_taken',
  'errors.run_status_unavailable',
  'errors.test_run_already_linked',
  'errors.upload_limit_reached',
  'errors.upload_incomplete',
  'errors.validation_failed',
  'errors.workspace_limit_reached',
  'errors.workspace_slug_taken',
]);

export function apiErrorTranslationKey(error: unknown): string {
  const code = apiErrorCode(error);
  if (code) {
    const translationKey = `errors.${code}`;
    if (translationKey && TRANSLATED_ERROR_KEYS.has(translationKey)) {
      return translationKey;
    }
  }

  return 'errors.default';
}

export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const parsed = apiErrorSchema.safeParse(error.error);
  return parsed.success ? parsed.data.error.code : null;
}
