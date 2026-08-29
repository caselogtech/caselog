import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { ProjectSummary, UpdateProjectRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Button,
  Callout,
  Dialog,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { ProjectSettingsApi } from '../../data-access/project-settings-api';

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-project-general-settings',
  imports: [
    Button,
    Callout,
    Dialog,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './project-general-settings.html',
  styleUrl: './project-general-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectGeneralSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly settingsApi = inject(ProjectSettingsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private hydratedProjectId: string | null = null;

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly projectSlug = computed(() => this.routeParams().get('project') ?? '');
  readonly saved = signal(false);
  readonly archiveConfirmationOpen = signal(false);
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));
  readonly form = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.maxLength(120)]],
  });

  readonly settings = injectQuery(() => ({
    queryKey: ['project-settings', this.workspaceSlug(), this.projectSlug()],
    queryFn: () => this.settingsApi.get(this.workspaceSlug(), this.projectSlug()),
    retry: false,
  }));
  readonly updateSettings = injectMutation(() => ({
    mutationFn: (request: UpdateProjectRequest) =>
      this.settingsApi.update(this.workspaceSlug(), this.projectSlug(), request),
    onSuccess: async (response) => {
      this.applySavedProject(response.project);
      await this.invalidateProjectLists();
    },
  }));
  readonly archiveProject = injectMutation(() => ({
    mutationFn: () => this.settingsApi.archive(this.workspaceSlug(), this.projectSlug()),
    onSuccess: async () => {
      this.archiveConfirmationOpen.set(false);
      await this.invalidateProjectLists();
      await this.router.navigate(['/', this.workspaceSlug(), 'projects'], { replaceUrl: true });
    },
  }));
  readonly project = computed(() => this.settings.data()?.project ?? null);

  constructor() {
    effect(() => {
      const project = this.project();
      if (!project) return;
      if (this.hydratedProjectId === project.id && this.form.dirty) return;
      this.hydrateForm(project);
    });
  }

  submit(): void {
    this.saved.set(false);
    if (!this.canManage() || this.updateSettings.isPending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.updateSettings.mutate({ name: this.form.controls.name.value.trim() });
  }

  discard(): void {
    const project = this.project();
    if (project) this.hydrateForm(project);
    this.saved.set(false);
  }

  requestArchive(): void {
    if (this.canManage() && !this.archiveProject.isPending()) {
      this.archiveConfirmationOpen.set(true);
    }
  }

  confirmArchive(): void {
    if (this.archiveConfirmationOpen() && !this.archiveProject.isPending()) {
      this.archiveProject.mutate();
    }
  }

  cancelArchive(): void {
    if (!this.archiveProject.isPending()) this.archiveConfirmationOpen.set(false);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.updateSettings.error() ?? this.archiveProject.error() ?? this.settings.error(),
    );
  }

  private applySavedProject(project: ProjectSummary): void {
    this.queryClient.setQueryData(['project-settings', this.workspaceSlug(), this.projectSlug()], {
      project,
    });
    this.hydrateForm(project);
    this.saved.set(true);
  }

  private hydrateForm(project: ProjectSummary): void {
    this.hydratedProjectId = project.id;
    this.form.reset({ name: project.name });
  }

  private invalidateProjectLists(): Promise<void> {
    return this.queryClient.invalidateQueries({ queryKey: ['projects', this.workspaceSlug()] });
  }
}
