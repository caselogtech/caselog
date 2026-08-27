import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateReleaseRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
} from '../../../../shared/ui/public-api';
import { ReleasesApi } from '../../data-access/releases-api';

type ReleaseSubmission = {
  request: CreateReleaseRequest;
  idempotencyKey: string;
};

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-release-create',
  imports: [
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './release-create.html',
  styleUrl: './release-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly releasesApi = inject(ReleasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly idempotency = new IdempotencyIdentity();

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );
  readonly form = this.formBuilder.group({
    key: [
      '',
      [
        trimmedRequired,
        Validators.maxLength(50),
        Validators.pattern(/^\s*[A-Za-z0-9][A-Za-z0-9._-]*\s*$/),
      ],
    ],
    name: ['', [trimmedRequired, Validators.maxLength(200)]],
    environmentId: [''],
    targetDate: [''],
    externalReference: ['', Validators.maxLength(2_048)],
  });

  readonly environments = injectQuery(() => ({
    queryKey: ['release-environments', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.releasesApi.listEnvironments(this.workspaceSlug, this.projectSlug),
  }));
  readonly activeEnvironments = computed(
    () => this.environments.data()?.items.filter(({ state }) => state === 'active') ?? [],
  );

  readonly createRelease = injectMutation(() => ({
    mutationFn: ({ request, idempotencyKey }: ReleaseSubmission) =>
      this.releasesApi.createRelease(this.workspaceSlug, this.projectSlug, request, idempotencyKey),
    onSuccess: async ({ release }) => {
      this.idempotency.clear();
      await this.queryClient.invalidateQueries({
        queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
      });
      return this.router.navigate([
        '/',
        this.workspaceSlug,
        this.projectSlug,
        'releases',
        release.id,
      ]);
    },
  }));

  submit(): void {
    if (!this.canManage() || this.form.invalid || this.createRelease.isPending()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateReleaseRequest = {
      key: value.key.trim(),
      name: value.name.trim(),
      externalReference: value.externalReference.trim() || undefined,
      ...(value.environmentId ? { environmentId: value.environmentId } : {}),
      ...(value.targetDate ? { targetDate: `${value.targetDate}T12:00:00.000Z` } : {}),
    };
    this.createRelease.mutate({
      request,
      idempotencyKey: this.idempotency.keyFor(request),
    });
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createRelease.error() ?? this.environments.error());
  }
}
