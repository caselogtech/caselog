import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ManageableWorkspaceRole, WorkspaceMember } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';
import { Button, FormControlStyle, StatusBadge } from '../../../../shared/ui/public-api';
import {
  assignableWorkspaceRoles,
  canManageWorkspaceMember,
  canTransferWorkspaceOwnership,
} from '../../domain/member-management';

export type MemberRoleChange = {
  member: WorkspaceMember;
  role: ManageableWorkspaceRole;
};

@Component({
  selector: 'app-member-list',
  imports: [Button, FormControlStyle, StatusBadge, TranslocoPipe],
  templateUrl: './member-list.html',
  styleUrl: './member-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberList {
  readonly members = input.required<readonly WorkspaceMember[]>();
  readonly actorRole = input<WorkspaceMember['role'] | null>(null);
  readonly actorUserId = input<string | null>(null);
  readonly pending = input(false);

  readonly roleChangeRequested = output<MemberRoleChange>();
  readonly deactivateRequested = output<WorkspaceMember>();
  readonly activateRequested = output<WorkspaceMember>();
  readonly ownershipRequested = output<WorkspaceMember>();

  readonly roleTranslationKey = workspaceRoleTranslationKey;

  canManage(member: WorkspaceMember): boolean {
    return canManageWorkspaceMember(this.actorRole(), this.actorUserId(), member);
  }

  canTransfer(member: WorkspaceMember): boolean {
    return canTransferWorkspaceOwnership(this.actorRole(), this.actorUserId(), member);
  }

  assignableRoles(): readonly ManageableWorkspaceRole[] {
    return assignableWorkspaceRoles(this.actorRole());
  }

  changeRole(member: WorkspaceMember, value: string): void {
    const role = this.assignableRoles().find((candidate) => candidate === value);
    if (role && role !== member.role) this.roleChangeRequested.emit({ member, role });
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
  }
}
