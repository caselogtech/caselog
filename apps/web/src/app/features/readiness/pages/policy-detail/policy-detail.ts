import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ReadinessPolicy } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Breadcrumbs,
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';
import { PolicyVersionList } from '../../components/policy-version-list/policy-version-list';
import { ReadinessApi } from '../../data-access/readiness-api';

type ReadinessPolicyVersion = ReadinessPolicy['versions'][number];

const STATE_LABEL: Record<ReadinessPolicyVersion['state'], string> = {
  draft: 'readiness.policies.states.draft',
  published: 'readiness.policies.states.published',
  retired: 'readiness.policies.states.retired',
};

@Component({
  selector: 'app-readiness-policy-detail',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    LoadingSkeleton,
    PageState,
    PolicyVersionList,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './policy-detail.html',
  styleUrl: './policy-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessPolicyDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly publishIdentity = new IdempotencyIdentity();

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly policyId = this.route.snapshot.paramMap.get('policyId') ?? '';
  readonly policyQueryKey = [
    'readiness-policy',
    this.workspaceSlug,
    this.projectSlug,
    this.policyId,
  ] as const;
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );

  readonly policyQuery = injectQuery(() => ({
    queryKey: this.policyQueryKey,
    queryFn: () => this.readinessApi.policy(this.workspaceSlug, this.projectSlug, this.policyId),
  }));
  readonly policy = computed(() => this.policyQuery.data()?.policy);
  readonly versions = computed(() =>
    [...(this.policy()?.versions ?? [])].sort((left, right) => right.version - left.version),
  );
  readonly latestVersion = computed(() => this.versions()[0]);
  readonly draftVersion = computed(() =>
    this.policy()?.versions.find(({ state }) => state === 'draft'),
  );
  readonly publishedVersion = computed(
    () =>
      this.policy()
        ?.versions.filter(({ state }) => state === 'published')
        .sort((left, right) => right.version - left.version)[0],
  );

  readonly publishPolicy = injectMutation(() => ({
    mutationFn: (draftId: string) =>
      this.readinessApi.publishPolicy(
        this.workspaceSlug,
        this.projectSlug,
        this.policyId,
        this.publishIdentity.keyFor({ policyId: this.policyId, draftId }),
      ),
    onSuccess: async (response) => {
      this.publishIdentity.clear();
      this.queryClient.setQueryData(this.policyQueryKey, response);
      await this.queryClient.invalidateQueries({
        queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
      });
    },
  }));

  stateTone(state: ReadinessPolicyVersion['state']): StatusBadgeTone {
    if (state === 'published') return 'success';
    if (state === 'draft') return 'pending';
    return 'neutral';
  }

  stateLabel(state: ReadinessPolicyVersion['state']): string {
    return STATE_LABEL[state];
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.publishPolicy.error() ?? this.policyQuery.error());
  }

  publishDraft(): void {
    const draft = this.draftVersion();
    if (this.canManage() && draft && !this.publishPolicy.isPending()) {
      this.publishPolicy.mutate(draft.id);
    }
  }
}
