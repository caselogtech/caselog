import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './forgot.html',
  styleUrl: '../auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly forgot = injectMutation(() => ({
    mutationFn: (request: ReturnType<typeof this.form.getRawValue>) =>
      this.authApi.forgotPassword(request),
  }));

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.forgot.mutate(this.form.getRawValue());
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.forgot.error());
  }
}
