import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ReadinessPolicy, UpdateReadinessPolicyRequest } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Breadcrumbs,
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { PolicyGateEditor } from '../../components/policy-gate-editor/policy-gate-editor';
import {
  createPolicyCreateForm,
  createPolicyVersionCreateForm,
  toCreateReadinessPolicyRequest,
} from '../../components/policy-gate-editor/policy-gate-editor-form';
import { ReadinessApi } from '../../data-access/readiness-api';

@Component({
  selector: 'app-policy-edit',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Breadcrumbs,
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    PolicyGateEditor,
  ],
  templateUrl: './policy-edit.html',
  styleUrl: './policy-edit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyEdit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReadinessApi);
  private readonly session = inject(WorkspaceSession);
  private readonly queries = inject(QueryClient);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly policyId = this.route.snapshot.paramMap.get('policyId') ?? '';
  readonly detailLink = [
    '/',
    this.workspaceSlug,
    this.projectSlug,
    'release-policies',
    this.policyId,
  ];
  readonly initial = signal<ReadinessPolicy | null>(null);
  readonly form = createPolicyCreateForm();
  readonly canManage = computed(() => hasWorkspacePermission(this.session.role(), 'lead'));
  readonly queryKey = ['readiness-policy', this.workspaceSlug, this.projectSlug, this.policyId];
  readonly policyQuery = injectQuery(() => ({
    queryKey: this.queryKey,
    queryFn: () => this.api.policy(this.workspaceSlug, this.projectSlug, this.policyId),
  }));
  readonly save = injectMutation(() => ({
    mutationFn: (request: UpdateReadinessPolicyRequest) =>
      this.api.updatePolicy(this.workspaceSlug, this.projectSlug, this.policyId, request),
    onSuccess: async (response) => {
      this.queries.setQueryData(this.queryKey, response);
      await this.queries.invalidateQueries({
        queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
      });
      await this.router.navigate(this.detailLink);
    },
  }));
  readonly conflict = computed(
    () => apiErrorCode(this.save.error()) === 'release_policy_draft_changed',
  );
  constructor() {
    effect(() => {
      const policy = this.policyQuery.data()?.policy;
      if (policy && !this.initial()) this.initialize(policy);
    });
  }
  submit(): void {
    const initial = this.initial();
    if (
      !initial ||
      !this.canManage() ||
      this.form.invalid ||
      this.save.isPending() ||
      this.conflict()
    ) {
      this.form.markAllAsTouched();
      return;
    }
    const request = toCreateReadinessPolicyRequest(this.form);
    this.save.mutate({
      name: request.name,
      description: request.description,
      gates: request.gates,
      expectedDraftId: initial.versions.find((item) => item.state === 'draft')?.id ?? null,
      expectedUpdatedAt: initial.updatedAt,
    });
  }
  async reload(): Promise<void> {
    const result = await this.policyQuery.refetch();
    if (result.isSuccess) {
      this.initialize(result.data.policy);
      this.save.reset();
      this.nameInput()?.nativeElement.focus();
    }
  }
  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.save.error() ?? this.policyQuery.error());
  }
  private initialize(policy: ReadinessPolicy): void {
    const source =
      policy.versions.find((item) => item.state === 'draft') ??
      policy.versions.find((item) => item.state === 'published');
    if (!source) return;
    this.initial.set(policy);
    this.form.patchValue({
      key: policy.key,
      name: policy.name,
      description: policy.description ?? '',
    });
    this.form.setControl('gates', createPolicyVersionCreateForm(source.gates).controls.gates);
    this.form.markAsPristine();
  }
}
