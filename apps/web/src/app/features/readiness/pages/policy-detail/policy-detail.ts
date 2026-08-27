import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ReadinessPolicy } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
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
    Button,
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

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly policyId = this.route.snapshot.paramMap.get('policyId') ?? '';

  readonly policyQuery = injectQuery(() => ({
    queryKey: ['readiness-policy', this.workspaceSlug, this.projectSlug, this.policyId],
    queryFn: () => this.readinessApi.policy(this.workspaceSlug, this.projectSlug, this.policyId),
  }));
  readonly policy = computed(() => this.policyQuery.data()?.policy);
  readonly versions = computed(() =>
    [...(this.policy()?.versions ?? [])].sort((left, right) => right.version - left.version),
  );
  readonly latestVersion = computed(() => this.versions()[0]);

  stateTone(state: ReadinessPolicyVersion['state']): StatusBadgeTone {
    if (state === 'published') return 'success';
    if (state === 'draft') return 'pending';
    return 'neutral';
  }

  stateLabel(state: ReadinessPolicyVersion['state']): string {
    return STATE_LABEL[state];
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.policyQuery.error());
  }
}
