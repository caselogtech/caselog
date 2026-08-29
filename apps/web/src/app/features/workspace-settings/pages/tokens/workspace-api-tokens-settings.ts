import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type {
  ApiTokenScope,
  ApiTokenSummary,
  CreateApiTokenRequest,
  CreateApiTokenResponse,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  Callout,
  Dialog,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { ApiTokenList } from '../../components/api-token-list/api-token-list';
import { ApiTokenSecretDialog } from '../../components/api-token-secret-dialog/api-token-secret-dialog';
import { WorkspaceApiTokensApi } from '../../data-access/workspace-api-tokens-api';
import {
  API_TOKEN_SCOPES,
  apiTokenExpiryIso,
  apiTokenScopeLabelKey,
  defaultApiTokenExpiry,
  maximumApiTokenExpiry,
  minimumApiTokenExpiry,
} from '../../domain/api-token-presentation';

type ScopeControlName = 'runsRead' | 'resultsWrite' | 'evidenceWrite';

const SCOPE_CONTROL_NAMES: Record<ApiTokenScope, ScopeControlName> = {
  'runs:read': 'runsRead',
  'results:write': 'resultsWrite',
  'evidence:write': 'evidenceWrite',
};

const validExpiry: ValidatorFn = (control) =>
  typeof control.value === 'string' && apiTokenExpiryIso(control.value)
    ? null
    : { invalidExpiry: true };

const scopeRequired: ValidatorFn = (control: AbstractControl) =>
  Object.values(control.value as Record<string, boolean>).some(Boolean)
    ? null
    : { scopeRequired: true };

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-workspace-api-tokens-settings',
  imports: [
    ApiTokenList,
    ApiTokenSecretDialog,
    Button,
    Callout,
    Dialog,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './workspace-api-tokens-settings.html',
  styleUrl: './workspace-api-tokens-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceApiTokensSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tokensApi = inject(WorkspaceApiTokensApi);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly scopes = API_TOKEN_SCOPES;
  readonly scopeLabelKey = apiTokenScopeLabelKey;
  readonly minimumExpiry = minimumApiTokenExpiry();
  readonly maximumExpiry = maximumApiTokenExpiry();
  readonly showCreateForm = signal(false);
  readonly createdToken = signal<CreateApiTokenResponse | null>(null);
  readonly revokeTarget = signal<ApiTokenSummary | null>(null);
  readonly revokeConfirmationOpen = computed(() => this.revokeTarget() !== null);
  readonly form = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.maxLength(100)]],
    expiresAt: [defaultApiTokenExpiry(), [Validators.required, validExpiry]],
    scopes: this.formBuilder.group(
      {
        runsRead: false,
        resultsWrite: false,
        evidenceWrite: false,
      },
      { validators: [scopeRequired] },
    ),
  });

  readonly tokens = injectQuery(() => ({
    queryKey: ['workspace-api-tokens', this.workspaceSlug],
    queryFn: () => this.tokensApi.list(this.workspaceSlug),
    retry: false,
  }));
  readonly createToken = injectMutation(() => ({
    mutationFn: (request: CreateApiTokenRequest) =>
      this.tokensApi.create(this.workspaceSlug, request),
    onSuccess: async (response) => {
      this.createdToken.set(response);
      this.showCreateForm.set(false);
      this.resetForm();
      await this.invalidateTokens();
    },
  }));
  readonly revokeToken = injectMutation(() => ({
    mutationFn: (tokenId: string) => this.tokensApi.revoke(this.workspaceSlug, tokenId),
    onSuccess: async () => {
      this.revokeTarget.set(null);
      await this.invalidateTokens();
    },
  }));
  readonly tokenItems = computed(() => this.tokens.data()?.apiTokens ?? []);

  openCreateForm(): void {
    this.createToken.reset();
    this.showCreateForm.set(true);
  }

  cancelCreate(): void {
    if (this.createToken.isPending()) return;
    this.showCreateForm.set(false);
    this.resetForm();
  }

  submit(): void {
    this.form.controls.expiresAt.updateValueAndValidity();
    if (this.form.invalid || this.createToken.isPending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const expiresAt = apiTokenExpiryIso(value.expiresAt);
    if (!expiresAt) {
      this.form.controls.expiresAt.setErrors({ invalidExpiry: true });
      return;
    }
    const scopes = API_TOKEN_SCOPES.filter((scope) => value.scopes[SCOPE_CONTROL_NAMES[scope]]);
    this.createToken.mutate({ name: value.name.trim(), scopes: [...scopes], expiresAt });
  }

  scopeControlName(scope: ApiTokenScope): ScopeControlName {
    return SCOPE_CONTROL_NAMES[scope];
  }

  requestRevoke(token: ApiTokenSummary): void {
    if (!this.revokeToken.isPending()) this.revokeTarget.set(token);
  }

  confirmRevoke(): void {
    const token = this.revokeTarget();
    if (token && !this.revokeToken.isPending()) this.revokeToken.mutate(token.id);
  }

  cancelRevoke(): void {
    if (!this.revokeToken.isPending()) this.revokeTarget.set(null);
  }

  closeSecret(): void {
    this.createdToken.set(null);
    this.createToken.reset();
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.createToken.error() ?? this.revokeToken.error() ?? this.tokens.error(),
    );
  }

  private resetForm(): void {
    this.form.reset({
      name: '',
      expiresAt: defaultApiTokenExpiry(),
      scopes: { runsRead: false, resultsWrite: false, evidenceWrite: false },
    });
  }

  private invalidateTokens(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['workspace-api-tokens', this.workspaceSlug],
    });
  }
}
