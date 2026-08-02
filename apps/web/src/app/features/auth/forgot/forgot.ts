import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { apiErrorMessage } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
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

  errorMessage(): string {
    return apiErrorMessage(this.forgot.error());
  }
}
