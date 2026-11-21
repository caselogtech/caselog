import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  accessibilityReviewRequestSchema,
  type CandidateReport,
  type QualityMetricDimensions,
} from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import { Button, Callout, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import { AccessibilityReviewsApi } from '../../data-access/accessibility-reviews-api';
@Component({
  selector: 'app-accessibility-review-form',
  imports: [ReactiveFormsModule, TranslocoPipe, Button, Callout, FormControlStyle, FormField],
  templateUrl: './accessibility-review-form.html',
  styleUrl: './accessibility-review-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessibilityReviewForm {
  private readonly api = inject(AccessibilityReviewsApi);
  private readonly identity = new IdempotencyIdentity();
  readonly workspace = input.required<string>();
  readonly project = input.required<string>();
  readonly candidate = input.required<string>();
  readonly gateKey = input.required<string>();
  readonly dimensions = input.required<QualityMetricDimensions>();
  readonly currentReview = input<EvidenceObservation | null>(null);
  readonly saved = output<void>();
  readonly reload = output<void>();
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly reports = signal<CandidateReport[]>([]);
  // Capture the review being edited at the first input, so a background refresh cannot hide a conflict.
  private expectedId: string | null | undefined;
  readonly form = new FormGroup({
    outcome: new FormControl<'ok' | 'not_ok' | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    tools: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(800)],
    }),
    keyboardNavigation: new FormControl<'passed' | 'failed' | 'not_checked'>('not_checked', {
      nonNullable: true,
    }),
    screenReader: new FormControl<'passed' | 'failed' | 'not_checked'>('not_checked', {
      nonNullable: true,
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });
  readonly checks = computed(() => this.dimensions().manualChecks ?? []);
  captureExpected(): void {
    if (this.expectedId === undefined) this.expectedId = this.currentReview()?.id ?? null;
  }
  async upload(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    this.captureExpected();
    this.error.set(null);
    const files = Array.from(input.files);
    if (
      files.length + this.reports().length > 10 ||
      files.some(
        (file) =>
          file.size === 0 || file.size > 104857600 || !/\.(pdf|json|html?|txt)$/i.test(file.name),
      )
    ) {
      this.error.set('readiness.accessibility.filesInvalid');
      return;
    }
    this.uploading.set(true);
    try {
      for (const file of files) {
        const result = await this.api.upload(
          this.workspace(),
          this.project(),
          this.candidate(),
          file,
        );
        this.reports.update((reports) => [...reports, result.attachment]);
      }
      input.value = '';
    } catch {
      this.error.set('readiness.accessibility.uploadFailed');
    } finally {
      this.uploading.set(false);
    }
  }
  removeReport(id: string): void {
    this.reports.update((reports) => reports.filter((report) => report.id !== id));
  }
  async submit(): Promise<void> {
    if (this.busy() || this.uploading() || this.conflict()) return;
    this.captureExpected();
    this.form.markAllAsTouched();
    this.error.set(null);
    const value = this.form.getRawValue();
    const parsed = accessibilityReviewRequestSchema.safeParse({
      ...value,
      dimensions: this.dimensions(),
      tools: [
        ...new Set(
          value.tools
            .split(/[,\n]/)
            .map((tool) => tool.trim())
            .filter(Boolean),
        ),
      ],
      reportIds: this.reports().map((report) => report.id),
      expectedObservationId: this.expectedId ?? null,
    });
    if (this.form.invalid || !parsed.success) {
      this.error.set('readiness.accessibility.reviewInvalid');
      return;
    }
    this.busy.set(true);
    try {
      const response = await this.api.record(
        this.workspace(),
        this.project(),
        this.candidate(),
        parsed.data,
        this.identity.keyFor(parsed.data),
      );
      this.identity.clear();
      this.expectedId = response.observation.id;
      this.form.reset();
      this.reports.set([]);
      this.saved.emit();
    } catch (error) {
      this.conflict.set(apiErrorCode(error) === 'accessibility_review_changed');
      this.error.set(
        this.conflict() ? 'readiness.accessibility.conflict' : apiErrorTranslationKey(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
  discardConflict(): void {
    this.expectedId = undefined;
    this.conflict.set(false);
    this.error.set(null);
    this.reload.emit();
  }
}
