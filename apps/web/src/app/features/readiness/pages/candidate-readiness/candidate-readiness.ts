import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CandidateReadinessResponse, ReleaseState } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { CandidateEvidence } from '../../components/candidate-evidence/candidate-evidence';
import { DecisionHistory } from '../../components/decision-history/decision-history';
import { LinkedRunSummary } from '../../components/linked-run-summary/linked-run-summary';
import { PolicyAssignment } from '../../components/policy-assignment/policy-assignment';
import { ReadinessGates } from '../../components/readiness-gates/readiness-gates';
import { ReadinessSummary } from '../../components/readiness-summary/readiness-summary';
import { ReadinessApi } from '../../data-access/readiness-api';
import { buildReadinessGateRows, releasePresentation } from '../../domain/readiness-presentation';

@Component({
  selector: 'app-candidate-readiness',
  imports: [
    Button,
    Callout,
    CandidateEvidence,
    DatePipe,
    DecisionHistory,
    LoadingSkeleton,
    LinkedRunSummary,
    PageState,
    PolicyAssignment,
    ReadinessGates,
    ReadinessSummary,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './candidate-readiness.html',
  styleUrl: './candidate-readiness.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidateReadiness {
  private readonly route = inject(ActivatedRoute);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly assignmentIdentity = new IdempotencyIdentity();

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly releaseId = this.route.snapshot.paramMap.get('releaseId') ?? '';
  readonly candidateId = this.route.snapshot.paramMap.get('candidateId') ?? '';
  readonly currentQueryKey = [
    'candidate-readiness',
    this.workspaceSlug,
    this.projectSlug,
    this.candidateId,
  ] as const;
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );

  readonly releaseContext = injectQuery(() => ({
    queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
    queryFn: () =>
      this.readinessApi.releaseDetail(this.workspaceSlug, this.projectSlug, this.releaseId),
  }));
  readonly candidate = computed(() =>
    this.releaseContext.data()?.candidates.find(({ id }) => id === this.candidateId),
  );
  readonly current = injectQuery<CandidateReadinessResponse>(() => ({
    queryKey: this.currentQueryKey,
    queryFn: () =>
      this.readinessApi.current(this.workspaceSlug, this.projectSlug, this.candidateId),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'pending' || state === 'stale' ? 5_000 : false;
    },
  }));
  readonly noPolicy = computed(
    () =>
      this.current.isError() &&
      apiErrorCode(this.current.error()) === 'release_policy_not_assigned',
  );
  readonly policies = injectQuery(() => ({
    queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.readinessApi.policies(this.workspaceSlug, this.projectSlug),
    enabled: this.noPolicy() && this.canManage(),
  }));
  readonly evidence = injectInfiniteQuery(() => ({
    queryKey: ['candidate-evidence', this.workspaceSlug, this.projectSlug, this.candidateId],
    queryFn: ({ pageParam }) =>
      this.readinessApi.evidence(
        this.workspaceSlug,
        this.projectSlug,
        this.candidateId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.current.isSuccess(),
  }));
  readonly history = injectInfiniteQuery(() => ({
    queryKey: ['readiness-history', this.workspaceSlug, this.projectSlug, this.candidateId],
    queryFn: ({ pageParam }) =>
      this.readinessApi.history(
        this.workspaceSlug,
        this.projectSlug,
        this.candidateId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.current.isSuccess(),
  }));
  readonly observations = computed(
    () => this.evidence.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly decisions = computed(
    () => this.history.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly gateRows = computed(() => {
    const decision = this.current.data()?.decision;
    return decision ? buildReadinessGateRows(decision, this.observations()) : [];
  });

  readonly evaluate = injectMutation(() => ({
    mutationFn: () =>
      this.readinessApi.evaluate(this.workspaceSlug, this.projectSlug, this.candidateId),
    onSuccess: async (response) => {
      this.queryClient.setQueryData(this.currentQueryKey, response);
      await this.invalidateDecisionData();
    },
  }));
  readonly assignPolicy = injectMutation(() => ({
    mutationFn: (policyId: string) =>
      this.readinessApi.assignPolicy(
        this.workspaceSlug,
        this.projectSlug,
        this.candidateId,
        policyId,
        this.assignmentIdentity.keyFor({ policyId }),
      ),
    onSuccess: async () => {
      this.assignmentIdentity.clear();
      await Promise.all([
        this.queryClient.invalidateQueries({ queryKey: this.currentQueryKey }),
        this.queryClient.invalidateQueries({
          queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
        }),
      ]);
    },
  }));

  lifecycle(state: ReleaseState) {
    return releasePresentation(state);
  }

  requestEvaluation(): void {
    if (this.canManage() && !this.evaluate.isPending()) this.evaluate.mutate();
  }

  failureMessageKey(): string {
    return this.current.data()?.failureCode === 'evaluation_retries_exhausted'
      ? 'readiness.projection.failureRetriesExhausted'
      : 'readiness.projection.failureUnknown';
  }

  errorTranslationKey(error?: unknown): string {
    return apiErrorTranslationKey(
      error ??
        this.assignPolicy.error() ??
        this.evaluate.error() ??
        this.current.error() ??
        this.releaseContext.error(),
    );
  }

  private invalidateDecisionData(): Promise<void> {
    return Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: ['readiness-history', this.workspaceSlug, this.projectSlug, this.candidateId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
      }),
    ]).then(() => undefined);
  }
}
