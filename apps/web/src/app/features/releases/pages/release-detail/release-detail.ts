import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ReleaseState } from '@caselog/schemas';
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
import {
  Breadcrumbs,
  Button,
  type ButtonVariant,
  Callout,
  Dialog,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import {
  type CandidateRunLinkRequest,
  CandidateRunManager,
  type CandidateRunUnlinkRequest,
} from '../../components/candidate-run-manager/candidate-run-manager';
import { ReleasesApi } from '../../data-access/releases-api';
import {
  type ReleaseLifecycleAction,
  releaseLifecycleActions,
  releaseLifecyclePresentation,
} from '../../domain/release-list-presentation';

const ACTION_LABEL: Record<ReleaseLifecycleAction, string> = {
  activate: 'releases.detail.actions.activate',
  release: 'releases.detail.actions.release',
  cancel: 'releases.detail.actions.cancel',
};

const CONFIRMATION_TITLE: Record<ReleaseLifecycleAction, string> = {
  activate: 'releases.detail.confirm.activateTitle',
  release: 'releases.detail.confirm.releaseTitle',
  cancel: 'releases.detail.confirm.cancelTitle',
};

const CONFIRMATION_MESSAGE: Record<ReleaseLifecycleAction, string> = {
  activate: 'releases.detail.confirm.activateMessage',
  release: 'releases.detail.confirm.releaseMessage',
  cancel: 'releases.detail.confirm.cancelMessage',
};

@Component({
  selector: 'app-release-detail',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    CandidateRunManager,
    DatePipe,
    Dialog,
    LoadingSkeleton,
    PageState,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './release-detail.html',
  styleUrl: './release-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly releasesApi = inject(ReleasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly releaseId = this.route.snapshot.paramMap.get('releaseId') ?? '';
  readonly confirmation = signal<ReleaseLifecycleAction | null>(null);
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));

  readonly detail = injectQuery(() => ({
    queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
    queryFn: () =>
      this.releasesApi.releaseDetail(this.workspaceSlug, this.projectSlug, this.releaseId),
  }));
  readonly release = computed(() => this.detail.data()?.release ?? null);
  readonly actions = computed(() => {
    const release = this.release();
    return release && this.canManage() ? releaseLifecycleActions(release.state) : [];
  });
  readonly canMutateCandidates = computed(() => {
    const state = this.release()?.state;
    return this.canManage() && (state === 'draft' || state === 'active');
  });
  readonly runs = injectInfiniteQuery(() => ({
    queryKey: ['release-run-selection', this.workspaceSlug, this.projectSlug],
    queryFn: ({ pageParam }) =>
      this.releasesApi.listTestRuns(this.workspaceSlug, this.projectSlug, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.canMutateCandidates(),
  }));
  readonly runItems = computed(() => this.runs.data()?.pages.flatMap(({ items }) => items) ?? []);

  readonly transition = injectMutation(() => ({
    mutationFn: (action: ReleaseLifecycleAction) =>
      this.releasesApi.transitionRelease(
        this.workspaceSlug,
        this.projectSlug,
        this.releaseId,
        action,
      ),
    onSuccess: async () => {
      await Promise.all([
        this.queryClient.invalidateQueries({
          queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
        }),
      ]);
    },
  }));
  readonly linkTestRun = injectMutation(() => ({
    mutationFn: ({ candidateId, runId, role }: CandidateRunLinkRequest) =>
      this.releasesApi.linkCandidateTestRun(
        this.workspaceSlug,
        this.projectSlug,
        candidateId,
        runId,
        role,
      ),
    onSuccess: () => this.invalidateCandidateData(),
  }));
  readonly unlinkTestRun = injectMutation(() => ({
    mutationFn: ({ candidateId, runId }: CandidateRunUnlinkRequest) =>
      this.releasesApi.unlinkCandidateTestRun(
        this.workspaceSlug,
        this.projectSlug,
        candidateId,
        runId,
      ),
    onSuccess: () => this.invalidateCandidateData(),
  }));

  lifecycle(state: ReleaseState) {
    return releaseLifecyclePresentation(state);
  }

  actionLabel(action: ReleaseLifecycleAction): string {
    return ACTION_LABEL[action];
  }

  actionVariant(action: ReleaseLifecycleAction): ButtonVariant {
    return action === 'cancel' ? 'danger' : 'primary';
  }

  confirmationTitle(): string {
    return CONFIRMATION_TITLE[this.confirmation() ?? 'activate'];
  }

  confirmationMessage(): string {
    return CONFIRMATION_MESSAGE[this.confirmation() ?? 'activate'];
  }

  requestTransition(action: ReleaseLifecycleAction): void {
    if (this.canManage() && !this.transition.isPending()) this.confirmation.set(action);
  }

  confirmTransition(): void {
    const action = this.confirmation();
    this.confirmation.set(null);
    if (action) this.transition.mutate(action);
  }

  candidateMutationPending(): boolean {
    return this.linkTestRun.isPending() || this.unlinkTestRun.isPending();
  }

  private invalidateCandidateData(): Promise<void> {
    return Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
      }),
    ]).then(() => undefined);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.detail.error() ??
        this.transition.error() ??
        this.linkTestRun.error() ??
        this.unlinkTestRun.error() ??
        this.runs.error(),
    );
  }
}
