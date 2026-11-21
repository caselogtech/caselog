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
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ReleaseSummary, UpdateReleaseRequest } from '@caselog/schemas';
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
import { ReleasesApi } from '../../data-access/releases-api';
import { releaseEditRequest, validReleaseDate } from '../../domain/release-edit-form';

const requiredName: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };
const validDate: ValidatorFn = (control) =>
  typeof control.value === 'string' && validReleaseDate(control.value) ? null : { date: true };

@Component({
  selector: 'app-release-edit',
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
  templateUrl: './release-edit.html',
  styleUrl: './release-edit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseEdit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReleasesApi);
  private readonly session = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly builder = inject(NonNullableFormBuilder);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly releaseId = this.route.snapshot.paramMap.get('releaseId') ?? '';
  readonly detailLink = ['/', this.workspaceSlug, this.projectSlug, 'releases', this.releaseId];
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly initial = signal<ReleaseSummary | null>(null);
  readonly form = this.builder.group({
    name: ['', [Validators.maxLength(200), requiredName]],
    environmentId: [''],
    targetDate: ['', validDate],
    externalReference: ['', Validators.maxLength(2048)],
  });
  readonly detail = injectQuery(() => ({
    queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
    queryFn: () => this.api.releaseDetail(this.workspaceSlug, this.projectSlug, this.releaseId),
  }));
  readonly canEdit = computed(() => {
    const state = this.detail.data()?.release.state;
    return (
      hasWorkspacePermission(this.session.role(), 'lead') &&
      (state === 'draft' || state === 'active')
    );
  });
  readonly environments = injectQuery(() => ({
    queryKey: ['release-environments', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.api.listEnvironments(this.workspaceSlug, this.projectSlug),
    enabled: this.canEdit(),
  }));
  readonly activeEnvironments = computed(
    () => this.environments.data()?.items.filter(({ state }) => state === 'active') ?? [],
  );
  readonly conflict = computed(() => apiErrorCode(this.save.error()) === 'release_changed');
  readonly save = injectMutation(() => ({
    mutationFn: (request: UpdateReleaseRequest) =>
      this.api.updateRelease(this.workspaceSlug, this.projectSlug, this.releaseId, request),
    onSuccess: async () => {
      await Promise.all([
        this.queryClient.invalidateQueries({
          queryKey: ['release', this.workspaceSlug, this.projectSlug, this.releaseId],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['release-environments', this.workspaceSlug, this.projectSlug],
        }),
      ]);
      await this.router.navigate(this.detailLink);
    },
  }));

  constructor() {
    effect(() => {
      const release = this.detail.data()?.release;
      if (release && !this.initial()) this.initialize(release);
    });
  }

  submit(): void {
    if (
      !this.canEdit() ||
      this.form.invalid ||
      this.conflict() ||
      this.save.isPending() ||
      !this.environments.isSuccess()
    ) {
      this.form.markAllAsTouched();
      return;
    }
    const initial = this.initial();
    if (initial) this.save.mutate(releaseEditRequest(this.form.getRawValue(), initial));
  }

  async reload(): Promise<void> {
    const result = await this.detail.refetch();
    if (result.isSuccess) {
      this.initialize(result.data.release);
      this.save.reset();
      this.nameInput()?.nativeElement.focus();
    }
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.save.error() ?? this.environments.error() ?? this.detail.error(),
    );
  }

  private initialize(release: ReleaseSummary): void {
    this.initial.set(release);
    this.form.reset({
      name: release.name,
      environmentId: release.environment?.id ?? '',
      targetDate: release.targetDate?.slice(0, 10) ?? '',
      externalReference: release.externalReference ?? '',
    });
  }
}
