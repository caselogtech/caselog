import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { AuthApi } from '../../data-access/auth-api';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './login.html',
  styleUrl: '../../components/auth-form.css',
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
      await this.router.navigateByUrl(
        session.user.emailVerified ? '/auth/workspaces' : '/auth/verify',
      );
    },
  }));

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.login.mutate(this.form.getRawValue());
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.login.error());
  }
}
