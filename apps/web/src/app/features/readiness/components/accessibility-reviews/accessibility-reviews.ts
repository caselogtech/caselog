import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { QualityMetricDimensions } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { Button, Callout, LoadingSkeleton } from '../../../../shared/ui/public-api';
import { AccessibilityReviewsApi } from '../../data-access/accessibility-reviews-api';
import { ReadinessApi } from '../../data-access/readiness-api';
import { accessibilityDetails, accessibilityScopeKey } from '../../domain/accessibility-review';
import { AccessibilityReviewForm } from '../accessibility-review-form/accessibility-review-form';
@Component({
  selector: 'app-accessibility-reviews',
  imports: [DatePipe, TranslocoPipe, Button, Callout, LoadingSkeleton, AccessibilityReviewForm],
  templateUrl: './accessibility-reviews.html',
  styleUrl: './accessibility-reviews.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessibilityReviews {
  private readonly api = inject(AccessibilityReviewsApi);
  private readonly policies = inject(ReadinessApi);
  private readonly queries = inject(QueryClient);
  readonly workspace = input.required<string>();
  readonly project = input.required<string>();
  readonly candidate = input.required<string>();
  readonly policyId = input.required<string>();
  readonly versionId = input.required<string>();
  readonly canManage = input(false);
  readonly saved = output<void>();
  readonly details = accessibilityDetails;
  checkStateKey(state: 'passed' | 'failed' | 'not_checked'): string {
    return {
      passed: 'readiness.accessibility.checkStates.passed',
      failed: 'readiness.accessibility.checkStates.failed',
      not_checked: 'readiness.accessibility.checkStates.not_checked',
    }[state];
  }
  readonly message = signal<string | null>(null);
  readonly downloadError = signal(false);
  readonly policy = injectQuery(() => ({
    queryKey: ['readiness-policy', this.workspace(), this.project(), this.policyId()],
    queryFn: () => this.policies.policy(this.workspace(), this.project(), this.policyId()),
  }));
  readonly requirements = computed(
    () =>
      this.policy
        .data()
        ?.policy.versions.find((version) => version.id === this.versionId())
        ?.gates.filter((gate) => gate.metricKey === 'accessibility.manual_review') ?? [],
  );
  readonly current = injectInfiniteQuery(() => ({
    queryKey: ['accessibility-reviews-current', this.workspace(), this.project(), this.candidate()],
    queryFn: ({ pageParam }) =>
      this.api.list(
        this.workspace(),
        this.project(),
        this.candidate(),
        true,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: this.requirements().length > 0,
  }));
  readonly history = injectInfiniteQuery(() => ({
    queryKey: ['accessibility-reviews-history', this.workspace(), this.project(), this.candidate()],
    queryFn: ({ pageParam }) =>
      this.api.list(
        this.workspace(),
        this.project(),
        this.candidate(),
        false,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: this.requirements().length > 0,
  }));
  readonly observations = computed(
    () => this.history.data()?.pages.flatMap((page) => page.items) ?? [],
  );
  currentReview(dimensions: QualityMetricDimensions) {
    return (
      this.current
        .data()
        ?.pages.flatMap((page) => page.items)
        .find(
          (item) => accessibilityScopeKey(item.dimensions) === accessibilityScopeKey(dimensions),
        ) ?? null
    );
  }
  async reviewSaved(): Promise<void> {
    this.message.set('readiness.accessibility.saved');
    await this.reload();
    this.saved.emit();
  }
  async reload(): Promise<void> {
    await Promise.all([
      this.queries.invalidateQueries({
        queryKey: [
          'accessibility-reviews-current',
          this.workspace(),
          this.project(),
          this.candidate(),
        ],
      }),
      this.queries.invalidateQueries({
        queryKey: [
          'accessibility-reviews-history',
          this.workspace(),
          this.project(),
          this.candidate(),
        ],
      }),
    ]);
  }
  async download(id: string): Promise<void> {
    this.downloadError.set(false);
    try {
      const response = await this.api.download(
        this.workspace(),
        this.project(),
        this.candidate(),
        id,
      );
      window.location.assign(response.download.url);
    } catch {
      this.downloadError.set(true);
    }
  }
}
