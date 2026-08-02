import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { apiErrorMessage } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  return control.value.password === control.value.confirmPassword
    ? null
    : { passwordsMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset.html',
  styleUrl: '../auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  readonly token = this.route.snapshot.queryParamMap.get('token');

  readonly form = this.formBuilder.group(
    {
      password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  readonly reset = injectMutation(() => ({
    mutationFn: (password: string) =>
      this.authApi.resetPassword({ token: this.token ?? '', password }),
  }));

  submit(): void {
    if (!this.token || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.reset.mutate(this.form.controls.password.value);
  }

  errorMessage(): string {
    return apiErrorMessage(this.reset.error());
  }
}
