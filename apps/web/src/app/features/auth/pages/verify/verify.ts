import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { AuthApi } from '../../data-access/auth-api';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './verify.html',
  styleUrl: '../../components/auth-form.css',
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

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.verification.error());
  }
}
