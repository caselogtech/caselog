import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  CreateReadinessPolicyVersionRequest,
  ReadinessGateInput,
  ReadinessPolicy,
} from '@caselog/schemas/readiness';
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
} from '../../../../shared/ui/public-api';
import { PolicyGateEditor } from '../../components/policy-gate-editor/policy-gate-editor';
import {
  createPolicyVersionCreateForm,
  toCreateReadinessPolicyVersionRequest,
} from '../../components/policy-gate-editor/policy-gate-editor-form';
import { ReadinessApi } from '../../data-access/readiness-api';

type PolicyVersion = ReadinessPolicy['versions'][number];
type PolicyGate = PolicyVersion['gates'][number];

@Component({
  selector: 'app-readiness-policy-version-create',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    LoadingSkeleton,
    PageState,
    PolicyGateEditor,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './policy-version-create.html',
  styleUrl: './policy-version-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessPolicyVersionCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly idempotency = new IdempotencyIdentity();
  private hydrated = false;

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
  readonly form = createPolicyVersionCreateForm();
  readonly policyQuery = injectQuery(() => ({
    queryKey: this.policyQueryKey,
    queryFn: () => this.readinessApi.policy(this.workspaceSlug, this.projectSlug, this.policyId),
  }));
  readonly policy = computed(() => this.policyQuery.data()?.policy);
  readonly existingDraft = computed(() =>
    this.policy()?.versions.find(({ state }) => state === 'draft'),
  );
  readonly sourceVersion = computed(
    () =>
      this.policy()
        ?.versions.filter(({ state }) => state === 'published')
        .sort((left, right) => right.version - left.version)[0],
  );
  readonly nextVersion = computed(
    () => Math.max(0, ...(this.policy()?.versions.map(({ version }) => version) ?? [])) + 1,
  );

  readonly createVersion = injectMutation(() => ({
    mutationFn: (request: CreateReadinessPolicyVersionRequest) =>
      this.readinessApi.createPolicyVersion(
        this.workspaceSlug,
        this.projectSlug,
        this.policyId,
        request,
        this.idempotency.keyFor(request),
      ),
    onSuccess: async (response) => {
      this.idempotency.clear();
      this.queryClient.setQueryData(this.policyQueryKey, response);
      await this.queryClient.invalidateQueries({
        queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
      });
      return this.router.navigate([
        '/',
        this.workspaceSlug,
        this.projectSlug,
        'release-policies',
        this.policyId,
      ]);
    },
  }));

  constructor() {
    effect(() => {
      const source = this.sourceVersion();
      if (!source || this.hydrated) return;
      const cloned = createPolicyVersionCreateForm(source.gates.map(toEditableGate));
      this.form.setControl('gates', cloned.controls.gates);
      this.form.markAsPristine();
      this.hydrated = true;
    });
  }

  submit(): void {
    if (
      !this.canManage() ||
      this.existingDraft() ||
      !this.sourceVersion() ||
      this.form.invalid ||
      this.createVersion.isPending()
    ) {
      this.form.markAllAsTouched();
      return;
    }
    this.createVersion.mutate(toCreateReadinessPolicyVersionRequest(this.form));
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createVersion.error() ?? this.policyQuery.error());
  }
}

function toEditableGate(gate: PolicyGate): ReadinessGateInput {
  return {
    key: gate.key,
    metricKey: gate.metricKey,
    metricVersion: gate.metricVersion,
    dimensions: gate.dimensions,
    operator: gate.operator,
    expected: gate.expected,
    impact: gate.impact,
    missingEvidenceBehavior: gate.missingEvidenceBehavior,
    staleEvidenceBehavior: gate.staleEvidenceBehavior,
    minimumTrust: gate.minimumTrust,
  };
}
