import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EvidenceProcessingIssue } from '@caselog/schemas/evidence';
import type { CandidateReadinessResponse } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../../shared/ui/public-api';

const ISSUE_TRANSLATION_KEYS = {
  test_run_unavailable: 'readiness.evidence.explorer.processing.codes.testRunUnavailable',
  invalid_source_data: 'readiness.evidence.explorer.processing.codes.invalidSourceData',
  native_materialization_failed:
    'readiness.evidence.explorer.processing.codes.nativeMaterializationFailed',
} as const satisfies Record<EvidenceProcessingIssue['code'], string>;

@Component({
  selector: 'app-evidence-processing-diagnostics',
  imports: [DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './evidence-processing-diagnostics.html',
  styleUrl: './evidence-processing-diagnostics.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceProcessingDiagnostics {
  readonly issues = input.required<EvidenceProcessingIssue[]>();
  readonly readiness = input<CandidateReadinessResponse | null>(null);
  readonly evaluationFailed = computed(() => this.readiness()?.state === 'failed');
  readonly visible = computed(() => this.issues().length > 0 || this.evaluationFailed());

  issueTranslationKey(issue: EvidenceProcessingIssue): string {
    return ISSUE_TRANSLATION_KEYS[issue.code];
  }

  evaluationTranslationKey(): string {
    return this.readiness()?.failureCode === 'evaluation_retries_exhausted'
      ? 'readiness.evidence.explorer.processing.codes.evaluationRetriesExhausted'
      : 'readiness.evidence.explorer.processing.codes.evaluationFailed';
  }
}
