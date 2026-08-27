import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { registerInvitationAccountRequestSchema, registerRequestSchema } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { InstanceCapabilities } from '../../../../core/instance/instance-capabilities';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { AuthApi } from '../../data-access/auth-api';
import {
  invitationTokenFromReturnUrl,
  safeInvitationReturnUrl,
} from '../../domain/auth-return-url';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './signup.html',
  styleUrl: '../../components/auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Signup {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly browserSession = inject(BrowserSession);
  readonly capabilities = inject(InstanceCapabilities);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly returnUrl = safeInvitationReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  readonly invitationToken = invitationTokenFromReturnUrl(this.returnUrl);
  readonly registrationAllowed = computed(
    () =>
      this.capabilities.loaded() &&
      (this.capabilities.publicRegistrationEnabled() || this.invitationToken !== null),
  );

  readonly form = this.formBuilder.group({
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', this.invitationToken === null ? [Validators.required, Validators.email] : []],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    termsAccepted: [false, this.capabilities.managedTermsRequired() ? Validators.requiredTrue : []],
  });

  readonly signup = injectMutation(() => ({
    mutationFn: (value: ReturnType<typeof this.form.getRawValue>) => {
      if (this.invitationToken) {
        return this.authApi.registerInvitationAccount(
          this.invitationToken,
          registerInvitationAccountRequestSchema.parse({
            displayName: value.displayName,
            password: value.password,
            termsAccepted: value.termsAccepted,
          }),
        );
      }
      return this.authApi.register(registerRequestSchema.parse(value));
    },
    onSuccess: async (session) => {
      this.browserSession.start(session);
      await this.router.navigateByUrl(this.returnUrl ?? '/auth/verify');
    },
  }));

  submit(): void {
    if (!this.registrationAllowed() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.signup.mutate(this.form.getRawValue());
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.signup.error());
  }
}
