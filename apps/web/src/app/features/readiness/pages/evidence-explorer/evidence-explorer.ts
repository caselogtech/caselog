import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { EvidenceFilters } from '../../components/evidence-filters/evidence-filters';
import { EvidenceObservationList } from '../../components/evidence-observation-list/evidence-observation-list';
import { ReadinessApi } from '../../data-access/readiness-api';
import {
  evidenceExplorerQueryParams,
  type EvidenceExplorerFilters as EvidenceExplorerFilterValue,
  isUuid,
  parseEvidenceExplorerState,
  toEvidenceListQuery,
} from '../../domain/evidence-explorer';

@Component({
  selector: 'app-evidence-explorer',
  imports: [
    Button,
    Callout,
    EvidenceFilters,
    EvidenceObservationList,
    LoadingSkeleton,
    PageState,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './evidence-explorer.html',
  styleUrl: './evidence-explorer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceExplorer {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly explorerState = computed(() =>
    parseEvidenceExplorerState((name) => this.queryParams().get(name)),
  );
  readonly filters = computed(() => this.explorerState().filters);
  readonly cursor = computed(() => this.explorerState().cursor);
  readonly hasCandidate = computed(() => isUuid(this.filters().candidateId));
  readonly activeFilterCount = computed(() => {
    const filters = this.filters();
    return [
      filters.metricKey,
      filters.producerKey,
      filters.sourceType,
      filters.trust,
      filters.freshness,
      filters.state,
      filters.observedAfter,
      filters.observedBefore,
      filters.currentOnly ? '' : 'history',
    ].filter(Boolean).length;
  });

  readonly evidence = injectQuery(() => {
    const state = this.explorerState();
    return {
      queryKey: [
        'evidence-explorer',
        this.workspaceSlug,
        this.projectSlug,
        state.filters,
        state.cursor,
      ],
      queryFn: () =>
        this.readinessApi.exploreEvidence(
          this.workspaceSlug,
          this.projectSlug,
          toEvidenceListQuery(state.filters, state.cursor),
        ),
      enabled: isUuid(state.filters.candidateId),
      retry: false,
    };
  });

  applyFilters(filters: EvidenceExplorerFilterValue): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: evidenceExplorerQueryParams(filters),
    });
  }

  nextPage(): void {
    const nextCursor = this.evidence.data()?.nextCursor;
    if (!nextCursor) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: evidenceExplorerQueryParams(this.filters(), nextCursor),
    });
  }

  firstPage(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: evidenceExplorerQueryParams(this.filters()),
    });
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.evidence.error());
  }
}
