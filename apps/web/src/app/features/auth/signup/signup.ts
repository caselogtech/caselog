import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { registerRequestSchema } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../core/auth/browser-session';
import { apiErrorTranslationKey } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './signup.html',
  styleUrl: '../auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Signup {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly browserSession = inject(BrowserSession);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.group({
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    termsAccepted: [false, Validators.requiredTrue],
  });

  readonly signup = injectMutation(() => ({
    mutationFn: (value: ReturnType<typeof this.form.getRawValue>) =>
      this.authApi.register(registerRequestSchema.parse(value)),
    onSuccess: async (session) => {
      this.browserSession.start(session);
      await this.router.navigateByUrl('/auth/verify');
    },
  }));

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.signup.mutate(this.form.getRawValue());
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.signup.error());
  }
}
