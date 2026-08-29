import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CreateReadinessWaiverRequest, ReadinessDecision } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Breadcrumbs,
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { ReadinessGates } from '../../components/readiness-gates/readiness-gates';
import {
  type RevokeWaiverRequest,
  WaiverManager,
} from '../../components/waiver-manager/waiver-manager';
import { ReadinessApi } from '../../data-access/readiness-api';
import {
  buildReadinessGateRows,
  readinessDispositionPresentation,
  readinessStatusPresentation,
  readinessTriggerLabel,
} from '../../domain/readiness-presentation';

@Component({
  selector: 'app-readiness-decision-detail',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    DatePipe,
    LoadingSkeleton,
    PageState,
    ReadinessGates,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
    WaiverManager,
  ],
  templateUrl: './decision-detail.html',
  styleUrl: './decision-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessDecisionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly createIdentity = new IdempotencyIdentity();
  private readonly revokeIdentity = new IdempotencyIdentity();
  private readonly waiverManager = viewChild(WaiverManager);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly releaseId = this.route.snapshot.paramMap.get('releaseId') ?? '';
  readonly candidateId = this.route.snapshot.paramMap.get('candidateId') ?? '';
  readonly decisionId = this.route.snapshot.paramMap.get('decisionId') ?? '';
  readonly decisionQueryKey = [
    'readiness-decision',
    this.workspaceSlug,
    this.projectSlug,
    this.decisionId,
  ] as const;
  readonly waiverQueryKey = [
    'readiness-waivers',
    this.workspaceSlug,
    this.projectSlug,
    this.decisionId,
  ] as const;
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));

  readonly releaseContext = injectQuery(() => ({
    queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
    queryFn: () =>
      this.readinessApi.releaseDetail(this.workspaceSlug, this.projectSlug, this.releaseId),
  }));
  readonly decisionQuery = injectQuery(() => ({
    queryKey: this.decisionQueryKey,
    queryFn: () =>
      this.readinessApi.decision(this.workspaceSlug, this.projectSlug, this.decisionId),
    retry: false,
  }));
  readonly decision = computed(() => this.decisionQuery.data()?.decision);
  readonly candidate = computed(() =>
    this.releaseContext.data()?.candidates.find(({ id }) => id === this.candidateId),
  );
  readonly contextMatches = computed(() => this.decision()?.candidateId === this.candidateId);

  readonly evidence = injectInfiniteQuery(() => ({
    queryKey: [
      'decision-evidence',
      this.workspaceSlug,
      this.projectSlug,
      this.candidateId,
      this.decisionId,
    ],
    queryFn: ({ pageParam }) =>
      this.readinessApi.evidence(
        this.workspaceSlug,
        this.projectSlug,
        this.candidateId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.contextMatches(),
  }));
  readonly waiverHistory = injectInfiniteQuery(() => ({
    queryKey: this.waiverQueryKey,
    queryFn: ({ pageParam }) =>
      this.readinessApi.waivers(
        this.workspaceSlug,
        this.projectSlug,
        this.decisionId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.contextMatches(),
  }));
  readonly observations = computed(
    () => this.evidence.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly waivers = computed(
    () => this.waiverHistory.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly gateRows = computed(() => {
    const decision = this.decision();
    return decision ? buildReadinessGateRows(decision, this.observations()) : [];
  });

  readonly createWaiver = injectMutation(() => ({
    mutationFn: (request: CreateReadinessWaiverRequest) =>
      this.readinessApi.createWaiver(
        this.workspaceSlug,
        this.projectSlug,
        this.decisionId,
        request,
        this.createIdentity.keyFor(request),
      ),
    onSuccess: async () => {
      this.createIdentity.clear();
      await this.invalidateWaiverState();
      this.waiverManager()?.completeCreate();
    },
  }));
  readonly revokeWaiver = injectMutation(() => ({
    mutationFn: ({ waiverId, request }: RevokeWaiverRequest) =>
      this.readinessApi.revokeWaiver(
        this.workspaceSlug,
        this.projectSlug,
        this.decisionId,
        waiverId,
        request,
        this.revokeIdentity.keyFor({ waiverId, request }),
      ),
    onSuccess: async () => {
      this.revokeIdentity.clear();
      await this.invalidateWaiverState();
      this.waiverManager()?.completeRevocation();
    },
  }));

  status(decision: ReadinessDecision) {
    return readinessStatusPresentation(decision.status);
  }

  disposition(decision: ReadinessDecision) {
    return readinessDispositionPresentation(decision.effectiveDisposition);
  }

  triggerLabel(decision: ReadinessDecision): string {
    return readinessTriggerLabel(decision.trigger);
  }

  errorTranslationKey(error?: unknown): string {
    return apiErrorTranslationKey(
      error ??
        this.createWaiver.error() ??
        this.revokeWaiver.error() ??
        this.decisionQuery.error() ??
        this.releaseContext.error(),
    );
  }

  private invalidateWaiverState(): Promise<void> {
    return Promise.all([
      this.queryClient.invalidateQueries({ queryKey: this.decisionQueryKey }),
      this.queryClient.invalidateQueries({ queryKey: this.waiverQueryKey }),
      this.queryClient.invalidateQueries({
        queryKey: ['candidate-readiness', this.workspaceSlug, this.projectSlug, this.candidateId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['readiness-history', this.workspaceSlug, this.projectSlug, this.candidateId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
      }),
    ]).then(() => undefined);
  }
}
