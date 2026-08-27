import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';
import { AuthApi } from '../../data-access/auth-api';

@Component({
  selector: 'app-workspace-invitation',
  imports: [DatePipe, RouterLink, TranslocoPipe],
  templateUrl: './invite.html',
  styleUrls: ['../../components/auth-form.css', './invite.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceInvitation {
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly browserSession = inject(BrowserSession);

  readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly returnUrl = `/auth/invite/${this.token}`;
  readonly roleTranslationKey = workspaceRoleTranslationKey;

  readonly preview = injectQuery(() => ({
    queryKey: ['workspace-invitation', this.token],
    queryFn: () => this.authApi.invitationPreview(this.token),
    retry: false,
  }));

  readonly accept = injectMutation(() => ({
    mutationFn: () => this.authApi.acceptInvitation(this.token),
    onSuccess: async ({ workspace }) => {
      await this.router.navigate(['/', workspace.slug]);
    },
  }));

  recipientMatches(): boolean {
    const currentEmail = this.browserSession.user()?.email;
    const invitationEmail = this.preview.data()?.email;
    return Boolean(
      currentEmail &&
        invitationEmail &&
        currentEmail.toLocaleLowerCase() === invitationEmail.toLocaleLowerCase(),
    );
  }

  acceptInvitation(): void {
    if (!this.recipientMatches() || this.accept.isPending()) return;
    this.accept.mutate();
  }

  acceptErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.accept.error());
  }
}
