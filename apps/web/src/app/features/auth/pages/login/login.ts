import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { InstanceCapabilities } from '../../../../core/instance/instance-capabilities';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { AuthApi } from '../../data-access/auth-api';
import { safeInvitationReturnUrl } from '../../domain/auth-return-url';

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
  readonly capabilities = inject(InstanceCapabilities);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly returnUrl = safeInvitationReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly login = injectMutation(() => ({
    mutationFn: (request: ReturnType<typeof this.form.getRawValue>) => this.authApi.login(request),
    onSuccess: async (session) => {
      this.browserSession.start(session);
      await this.router.navigateByUrl(
        this.returnUrl ?? (session.user.emailVerified ? '/auth/workspaces' : '/auth/verify'),
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
