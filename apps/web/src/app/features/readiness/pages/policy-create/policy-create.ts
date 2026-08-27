import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateReadinessPolicyRequest } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import { Button, Callout, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import { PolicyGateEditor } from '../../components/policy-gate-editor/policy-gate-editor';
import {
  createPolicyCreateForm,
  toCreateReadinessPolicyRequest,
} from '../../components/policy-gate-editor/policy-gate-editor-form';
import { ReadinessApi } from '../../data-access/readiness-api';

@Component({
  selector: 'app-readiness-policy-create',
  imports: [
    Button,
    Callout,
    FormControlStyle,
    FormField,
    PolicyGateEditor,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './policy-create.html',
  styleUrl: './policy-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessPolicyCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly readinessApi = inject(ReadinessApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly idempotency = new IdempotencyIdentity();

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );
  readonly form = createPolicyCreateForm();

  readonly createPolicy = injectMutation(() => ({
    mutationFn: (request: CreateReadinessPolicyRequest) =>
      this.readinessApi.createPolicy(
        this.workspaceSlug,
        this.projectSlug,
        request,
        this.idempotency.keyFor(request),
      ),
    onSuccess: async ({ policy }) => {
      this.idempotency.clear();
      await this.queryClient.invalidateQueries({
        queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
      });
      return this.router.navigate([
        '/',
        this.workspaceSlug,
        this.projectSlug,
        'release-policies',
        policy.id,
      ]);
    },
  }));

  submit(): void {
    if (!this.canManage() || this.form.invalid || this.createPolicy.isPending()) {
      this.form.markAllAsTouched();
      return;
    }

    this.createPolicy.mutate(toCreateReadinessPolicyRequest(this.form));
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createPolicy.error());
  }
}
