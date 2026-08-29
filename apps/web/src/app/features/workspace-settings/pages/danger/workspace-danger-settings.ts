import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { WorkspaceSettingsApi } from '../../data-access/workspace-settings-api';

@Component({
  selector: 'app-workspace-danger-settings',
  imports: [
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './workspace-danger-settings.html',
  styleUrl: './workspace-danger-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceDangerSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly settingsApi = inject(WorkspaceSettingsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly canDelete = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'owner'),
  );
  readonly form = this.formBuilder.group({
    confirmation: ['', [Validators.required, Validators.maxLength(120)]],
  });
  private readonly confirmationValue = toSignal(this.form.controls.confirmation.valueChanges, {
    initialValue: this.form.controls.confirmation.value,
  });
  readonly settings = injectQuery(() => ({
    queryKey: ['workspace-settings', this.workspaceSlug],
    queryFn: () => this.settingsApi.get(this.workspaceSlug),
    retry: false,
  }));
  readonly deleteWorkspace = injectMutation(() => ({
    mutationFn: (confirmation: string) =>
      this.settingsApi.delete(this.workspaceSlug, { confirmation }),
    onSuccess: () => this.finishDeletion(),
  }));
  readonly confirmationMatches = computed(() => {
    const expected = this.settings.data()?.workspace.name;
    return Boolean(expected && this.confirmationValue() === expected);
  });

  submit(): void {
    if (!this.canDelete() || this.deleteWorkspace.isPending() || !this.confirmationMatches()) {
      this.form.markAllAsTouched();
      return;
    }
    this.deleteWorkspace.mutate(this.form.controls.confirmation.value);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.deleteWorkspace.error() ?? this.settings.error());
  }

  private async finishDeletion(): Promise<void> {
    this.workspaceSession.clear();
    await this.queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    await this.router.navigate(['/auth/workspaces'], { replaceUrl: true });
  }
}
