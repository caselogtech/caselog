import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../core/auth/browser-session';
import { apiErrorMessage } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly browserSession = inject(BrowserSession);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly login = injectMutation(() => ({
    mutationFn: (request: ReturnType<typeof this.form.getRawValue>) => this.authApi.login(request),
    onSuccess: async (session) => {
      this.browserSession.start(session);
      await this.router.navigateByUrl('/auth/workspaces');
    },
  }));

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.login.mutate(this.form.getRawValue());
  }

  errorMessage(): string {
    return apiErrorMessage(this.login.error());
  }
}
