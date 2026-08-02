import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../core/auth/browser-session';
import { apiErrorMessage } from '../../../shared/api/api-error';
import { AuthApi } from '../auth-api';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify.html',
  styleUrl: '../auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmail {
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  readonly browserSession = inject(BrowserSession);
  readonly token = this.route.snapshot.queryParamMap.get('token');

  readonly verification = injectMutation(() => ({
    mutationFn: (token: string) => this.authApi.verifyEmail({ token }),
  }));

  readonly resend = injectMutation(() => ({
    mutationFn: () => this.authApi.resendEmailVerification(),
  }));

  constructor() {
    if (this.token) {
      this.verification.mutate(this.token);
    }
  }

  errorMessage(): string {
    return apiErrorMessage(this.verification.error());
  }
}
