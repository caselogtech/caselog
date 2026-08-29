import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  CreateEnvironmentRequest,
  EnvironmentSettingsSummary,
  UpdateEnvironmentRequest,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Button,
  Callout,
  Dialog,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { EnvironmentCreateForm } from '../../components/environment-create-form/environment-create-form';
import { EnvironmentEditForm } from '../../components/environment-edit-form/environment-edit-form';
import {
  EnvironmentList,
  type EnvironmentStateChangeRequest,
} from '../../components/environment-list/environment-list';
import { ProjectEnvironmentsApi } from '../../data-access/project-environments-api';

type EnvironmentSubmission = {
  idempotencyKey: string;
  request: CreateEnvironmentRequest;
};

type EnvironmentUpdateSubmission = {
  environmentId: string;
  request: UpdateEnvironmentRequest;
};

@Component({
  selector: 'app-environment-settings',
  imports: [
    Button,
    Callout,
    Dialog,
    EnvironmentCreateForm,
    EnvironmentEditForm,
    EnvironmentList,
    LoadingSkeleton,
    PageState,
    TranslocoPipe,
  ],
  templateUrl: './environment-settings.html',
  styleUrl: './environment-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly environmentsApi = inject(ProjectEnvironmentsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly idempotency = new IdempotencyIdentity();

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly projectSlug = computed(() => this.routeParams().get('project') ?? '');
  readonly showCreate = signal(false);
  readonly editTarget = signal<EnvironmentSettingsSummary | null>(null);
  readonly confirmation = signal<EnvironmentStateChangeRequest | null>(null);
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));

  readonly environments = injectQuery(() => ({
    queryKey: ['project-environments', this.workspaceSlug(), this.projectSlug()],
    queryFn: () => this.environmentsApi.list(this.workspaceSlug(), this.projectSlug()),
  }));
  readonly createEnvironment = injectMutation(() => ({
    mutationFn: ({ idempotencyKey, request }: EnvironmentSubmission) =>
      this.environmentsApi.create(
        this.workspaceSlug(),
        this.projectSlug(),
        request,
        idempotencyKey,
      ),
    onSuccess: async () => {
      this.idempotency.clear();
      this.showCreate.set(false);
      await this.invalidateEnvironmentQueries();
    },
  }));
  readonly changeState = injectMutation(() => ({
    mutationFn: ({ action, environment }: EnvironmentStateChangeRequest) =>
      this.environmentsApi.changeState(
        this.workspaceSlug(),
        this.projectSlug(),
        environment.id,
        action,
      ),
    onSuccess: () => this.invalidateEnvironmentQueries(),
  }));
  readonly updateEnvironment = injectMutation(() => ({
    mutationFn: ({ environmentId, request }: EnvironmentUpdateSubmission) =>
      this.environmentsApi.update(this.workspaceSlug(), this.projectSlug(), environmentId, request),
    onSuccess: async () => {
      this.editTarget.set(null);
      await this.invalidateEnvironmentQueries();
    },
  }));

  openCreate(): void {
    if (this.canManage() && !this.createEnvironment.isPending()) {
      this.editTarget.set(null);
      this.showCreate.set(true);
    }
  }

  create(request: CreateEnvironmentRequest): void {
    if (!this.canManage() || this.createEnvironment.isPending()) return;
    this.createEnvironment.mutate({
      request,
      idempotencyKey: this.idempotency.keyFor(request),
    });
  }

  openEdit(environment: EnvironmentSettingsSummary): void {
    if (this.canManage() && !this.updateEnvironment.isPending()) {
      this.showCreate.set(false);
      this.editTarget.set(environment);
    }
  }

  update(request: UpdateEnvironmentRequest): void {
    const environment = this.editTarget();
    if (!environment || !this.canManage() || this.updateEnvironment.isPending()) return;
    this.updateEnvironment.mutate({ environmentId: environment.id, request });
  }

  requestStateChange(request: EnvironmentStateChangeRequest): void {
    if (this.canManage() && !this.changeState.isPending()) this.confirmation.set(request);
  }

  confirmStateChange(): void {
    const request = this.confirmation();
    this.confirmation.set(null);
    if (request) this.changeState.mutate(request);
  }

  private invalidateEnvironmentQueries(): Promise<void> {
    return Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: ['project-environments', this.workspaceSlug(), this.projectSlug()],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['release-environments', this.workspaceSlug(), this.projectSlug()],
      }),
    ]).then(() => undefined);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.createEnvironment.error() ??
        this.updateEnvironment.error() ??
        this.changeState.error() ??
        this.environments.error(),
    );
  }
}
