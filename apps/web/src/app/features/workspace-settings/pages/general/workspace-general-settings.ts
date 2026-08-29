import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { UpdateWorkspaceRequest, WorkspaceSettings } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { WorkspaceSettingsApi } from '../../data-access/workspace-settings-api';

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-workspace-general-settings',
  imports: [
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './workspace-general-settings.html',
  styleUrl: './workspace-general-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceGeneralSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly settingsApi = inject(WorkspaceSettingsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private hydratedWorkspaceId: string | null = null;

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly saved = signal(false);
  readonly canManage = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'admin'),
  );
  readonly form = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.minLength(2), Validators.maxLength(120)]],
    slug: [
      '',
      [
        trimmedRequired,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ],
    ],
  });

  readonly settings = injectQuery(() => ({
    queryKey: ['workspace-settings', this.workspaceSlug],
    queryFn: () => this.settingsApi.get(this.workspaceSlug),
    retry: false,
  }));
  readonly updateSettings = injectMutation(() => ({
    mutationFn: (request: UpdateWorkspaceRequest) =>
      this.settingsApi.update(this.workspaceSlug, request),
    onSuccess: (response) => this.applySavedWorkspace(response.workspace),
  }));

  constructor() {
    effect(() => {
      const workspace = this.settings.data()?.workspace;
      if (!workspace) return;
      if (this.hydratedWorkspaceId === workspace.id && this.form.dirty) return;
      this.hydrateForm(workspace);
    });
  }

  submit(): void {
    this.saved.set(false);
    if (!this.canManage() || this.updateSettings.isPending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.updateSettings.mutate({ name: value.name.trim(), slug: value.slug.trim() });
  }

  discard(): void {
    const workspace = this.settings.data()?.workspace;
    if (workspace) this.hydrateForm(workspace);
    this.saved.set(false);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.updateSettings.error() ?? this.settings.error());
  }

  private hydrateForm(workspace: WorkspaceSettings): void {
    this.hydratedWorkspaceId = workspace.id;
    this.form.reset({ name: workspace.name, slug: workspace.slug });
  }

  private async applySavedWorkspace(workspace: WorkspaceSettings): Promise<void> {
    const current = this.workspaceSession.current();
    if (current?.organization.id === workspace.id) {
      this.workspaceSession.start({
        ...current,
        organization: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      });
    }
    this.queryClient.setQueryData(['workspace-settings', this.workspaceSlug], { workspace });
    this.hydrateForm(workspace);
    this.saved.set(true);
    if (workspace.slug !== this.workspaceSlug) {
      await this.router.navigate(['/', workspace.slug, 'settings', 'general'], {
        replaceUrl: true,
      });
    }
  }
}
