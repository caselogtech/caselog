import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { WorkspaceInvitation } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';
import { Button, StatusBadge } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-invitation-list',
  imports: [Button, StatusBadge, TranslocoPipe],
  templateUrl: './invitation-list.html',
  styleUrl: './invitation-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationList {
  readonly invitations = input.required<readonly WorkspaceInvitation[]>();
  readonly canManage = input(false);
  readonly pending = input(false);
  readonly resendRequested = output<WorkspaceInvitation>();
  readonly revokeRequested = output<WorkspaceInvitation>();
  readonly roleTranslationKey = workspaceRoleTranslationKey;

  statusTone(status: WorkspaceInvitation['status']) {
    if (status === 'pending') return 'pending' as const;
    if (status === 'accepted') return 'success' as const;
    if (status === 'expired') return 'warning' as const;
    return 'neutral' as const;
  }

  statusTranslationKey(status: WorkspaceInvitation['status']): string {
    switch (status) {
      case 'pending':
        return 'workspaceSettings.members.invite.status.pending';
      case 'accepted':
        return 'workspaceSettings.members.invite.status.accepted';
      case 'revoked':
        return 'workspaceSettings.members.invite.status.revoked';
      case 'expired':
        return 'workspaceSettings.members.invite.status.expired';
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}
