import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateReleaseCandidateRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Breadcrumbs,
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { ReleasesApi } from '../../data-access/releases-api';

type CandidateSubmission = {
  request: CreateReleaseCandidateRequest;
  idempotencyKey: string;
};

const identityRequired: ValidatorFn = (control) => {
  const value = control.value as Record<string, unknown> | null;
  const present = ['sourceRevision', 'buildIdentifier', 'artifactDigest'].some((key) => {
    const candidate = value?.[key];
    return typeof candidate === 'string' && candidate.trim().length > 0;
  });
  return present ? null : { identityRequired: true };
};

const optionalUrl: ValidatorFn = (control) => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) return null;
  try {
    new URL(value);
    return null;
  } catch {
    return { url: true };
  }
};

@Component({
  selector: 'app-candidate-create',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './candidate-create.html',
  styleUrl: './candidate-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidateCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly releasesApi = inject(ReleasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly idempotency = new IdempotencyIdentity();

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly releaseId = this.route.snapshot.paramMap.get('releaseId') ?? '';
  readonly submissionAttempted = signal(false);
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );
  readonly form = this.formBuilder.group(
    {
      sourceRevision: ['', Validators.maxLength(255)],
      buildIdentifier: ['', Validators.maxLength(255)],
      artifactDigest: ['', Validators.maxLength(255)],
      branch: ['', Validators.maxLength(255)],
      version: ['', Validators.maxLength(120)],
      sourceUrl: ['', [Validators.maxLength(2_048), optionalUrl]],
    },
    { validators: identityRequired },
  );

  readonly release = injectQuery(() => ({
    queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
    queryFn: () =>
      this.releasesApi.releaseDetail(this.workspaceSlug, this.projectSlug, this.releaseId),
  }));
  readonly canCreate = computed(() => {
    const state = this.release.data()?.release.state;
    return this.canManage() && (state === 'draft' || state === 'active');
  });

  readonly createCandidate = injectMutation(() => ({
    mutationFn: ({ request, idempotencyKey }: CandidateSubmission) =>
      this.releasesApi.createCandidate(
        this.workspaceSlug,
        this.projectSlug,
        this.releaseId,
        request,
        idempotencyKey,
      ),
    onSuccess: async () => {
      this.idempotency.clear();
      await Promise.all([
        this.queryClient.invalidateQueries({
          queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
        }),
      ]);
      return this.router.navigate([
        '/',
        this.workspaceSlug,
        this.projectSlug,
        'releases',
        this.releaseId,
      ]);
    },
  }));

  submit(): void {
    this.submissionAttempted.set(true);
    if (!this.canCreate() || this.form.invalid || this.createCandidate.isPending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: CreateReleaseCandidateRequest = {
      sourceRevision: value.sourceRevision.trim() || undefined,
      buildIdentifier: value.buildIdentifier.trim() || undefined,
      artifactDigest: value.artifactDigest.trim() || undefined,
      branch: value.branch.trim() || undefined,
      version: value.version.trim() || undefined,
      ...(value.sourceUrl.trim() ? { sourceUrl: value.sourceUrl.trim() } : {}),
    };
    this.createCandidate.mutate({
      request,
      idempotencyKey: this.idempotency.keyFor(request),
    });
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createCandidate.error() ?? this.release.error());
  }
}
