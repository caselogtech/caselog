import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  CreateWorkspaceInvitationsRequest,
  WorkspaceInvitation,
  WorkspaceMember,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Button,
  Callout,
  Dialog,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { InvitationForm } from '../../components/invitation-form/invitation-form';
import { InvitationList } from '../../components/invitation-list/invitation-list';
import { MemberList, type MemberRoleChange } from '../../components/member-list/member-list';
import { OwnershipTransferDialog } from '../../components/ownership-transfer-dialog/ownership-transfer-dialog';
import { WorkspaceMembersApi } from '../../data-access/workspace-members-api';
import { parseMemberSettingsView } from '../../domain/member-management';

type InvitationAction = {
  action: 'resend' | 'revoke';
  invitation: WorkspaceInvitation;
};

@Component({
  selector: 'app-workspace-members-settings',
  imports: [
    Button,
    Callout,
    Dialog,
    InvitationForm,
    InvitationList,
    LoadingSkeleton,
    MemberList,
    OwnershipTransferDialog,
    PageState,
    TranslocoPipe,
  ],
  templateUrl: './workspace-members-settings.html',
  styleUrl: './workspace-members-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceMembersSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly membersApi = inject(WorkspaceMembersApi);
  private readonly workspaceAccess = inject(WorkspaceAccess);
  private readonly queryClient = inject(QueryClient);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly browserSession = inject(BrowserSession);
  readonly workspaceSession = inject(WorkspaceSession);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly view = computed(() => parseMemberSettingsView(this.queryParams().get('view')));
  readonly canManage = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'admin'),
  );
  readonly workspaceName = computed(
    () => this.workspaceSession.organization()?.name ?? this.workspaceSlug,
  );
  readonly showInvitationForm = signal(false);
  readonly deactivateTarget = signal<WorkspaceMember | null>(null);
  readonly ownershipTarget = signal<WorkspaceMember | null>(null);
  readonly invitationConfirmation = signal<InvitationAction | null>(null);
  readonly successKey = signal<string | null>(null);

  readonly access = injectQuery(() => ({
    queryKey: ['workspace-access', this.workspaceSlug],
    queryFn: () => this.workspaceAccess.open(this.workspaceSlug),
    retry: false,
  }));

  readonly members = injectInfiniteQuery(() => {
    const state = this.view() === 'inactive' ? 'inactive' : 'active';
    return {
      queryKey: ['workspace-members', this.workspaceSlug, state],
      queryFn: ({ pageParam }) =>
        this.membersApi.members(this.workspaceSlug, state, pageParam ?? undefined),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: this.access.isSuccess() && this.view() !== 'invitations',
      retry: false,
    };
  });
  readonly memberItems = computed(
    () => this.members.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly invitations = injectInfiniteQuery(() => ({
    queryKey: ['workspace-invitations', this.workspaceSlug],
    queryFn: ({ pageParam }) =>
      this.membersApi.invitations(this.workspaceSlug, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: this.access.isSuccess() && this.view() === 'invitations' && this.canManage(),
    retry: false,
  }));
  readonly invitationItems = computed(
    () => this.invitations.data()?.pages.flatMap(({ items }) => items) ?? [],
  );

  readonly changeRole = injectMutation(() => ({
    mutationFn: ({ member, role }: MemberRoleChange) =>
      this.membersApi.updateRole(this.workspaceSlug, member.membershipId, role),
    onSuccess: () => this.finishMemberMutation('workspaceSettings.members.success.role'),
  }));
  readonly changeState = injectMutation(() => ({
    mutationFn: async ({
      action,
      member,
    }: {
      action: 'activate' | 'deactivate';
      member: WorkspaceMember;
    }) => {
      if (action === 'activate') {
        await this.membersApi.activate(this.workspaceSlug, member.membershipId);
      } else {
        await this.membersApi.deactivate(this.workspaceSlug, member.membershipId);
      }
    },
    onSuccess: () => {
      this.deactivateTarget.set(null);
      return this.finishMemberMutation('workspaceSettings.members.success.state');
    },
  }));
  readonly transferOwnership = injectMutation(() => ({
    mutationFn: (member: WorkspaceMember) =>
      this.membersApi.transferOwnership(this.workspaceSlug, member.membershipId),
    onSuccess: () => this.finishOwnershipTransfer(),
  }));
  readonly createInvitation = injectMutation(() => ({
    mutationFn: (request: CreateWorkspaceInvitationsRequest) =>
      this.membersApi.createInvitations(this.workspaceSlug, request),
    onSuccess: () => {
      this.showInvitationForm.set(false);
      return this.finishInvitationMutation('workspaceSettings.members.success.invited');
    },
  }));
  readonly mutateInvitation = injectMutation(() => ({
    mutationFn: async ({ action, invitation }: InvitationAction) => {
      if (action === 'resend') {
        await this.membersApi.resendInvitation(this.workspaceSlug, invitation.id);
      } else {
        await this.membersApi.revokeInvitation(this.workspaceSlug, invitation.id);
      }
    },
    onSuccess: (_response, request) => {
      this.invitationConfirmation.set(null);
      return this.finishInvitationMutation(
        request.action === 'resend'
          ? 'workspaceSettings.members.success.resent'
          : 'workspaceSettings.members.success.revoked',
      );
    },
  }));
  readonly operationPending = computed(
    () =>
      this.changeRole.isPending() ||
      this.changeState.isPending() ||
      this.transferOwnership.isPending() ||
      this.createInvitation.isPending() ||
      this.mutateInvitation.isPending(),
  );

  selectView(view: 'active' | 'invitations' | 'inactive'): void {
    this.successKey.set(null);
    this.showInvitationForm.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'active' ? null : view },
      queryParamsHandling: 'merge',
    });
  }

  requestDeactivate(member: WorkspaceMember): void {
    if (this.canManage() && !this.operationPending()) this.deactivateTarget.set(member);
  }

  confirmDeactivate(): void {
    const member = this.deactivateTarget();
    if (member) this.changeState.mutate({ action: 'deactivate', member });
  }

  activate(member: WorkspaceMember): void {
    if (this.canManage() && !this.operationPending()) {
      this.changeState.mutate({ action: 'activate', member });
    }
  }

  requestOwnership(member: WorkspaceMember): void {
    if (hasWorkspacePermission(this.workspaceSession.role(), 'owner') && !this.operationPending()) {
      this.ownershipTarget.set(member);
    }
  }

  requestResend(invitation: WorkspaceInvitation): void {
    if (this.canManage() && !this.operationPending()) {
      this.mutateInvitation.mutate({ action: 'resend', invitation });
    }
  }

  requestRevoke(invitation: WorkspaceInvitation): void {
    if (this.canManage() && !this.operationPending()) {
      this.invitationConfirmation.set({ action: 'revoke', invitation });
    }
  }

  confirmInvitationAction(): void {
    const request = this.invitationConfirmation();
    if (request) this.mutateInvitation.mutate(request);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.changeRole.error() ??
        this.changeState.error() ??
        this.transferOwnership.error() ??
        this.createInvitation.error() ??
        this.mutateInvitation.error() ??
        this.members.error() ??
        this.invitations.error() ??
        this.access.error(),
    );
  }

  private finishMemberMutation(successKey: string): Promise<void> {
    this.successKey.set(successKey);
    return this.queryClient
      .invalidateQueries({ queryKey: ['workspace-members', this.workspaceSlug] })
      .then(() => undefined);
  }

  private finishInvitationMutation(successKey: string): Promise<void> {
    this.successKey.set(successKey);
    return this.queryClient
      .invalidateQueries({ queryKey: ['workspace-invitations', this.workspaceSlug] })
      .then(() => undefined);
  }

  private async finishOwnershipTransfer(): Promise<void> {
    this.ownershipTarget.set(null);
    this.successKey.set('workspaceSettings.members.success.ownership');
    this.workspaceSession.clear();
    await this.workspaceAccess.open(this.workspaceSlug);
    await this.queryClient.invalidateQueries({
      queryKey: ['workspace-members', this.workspaceSlug],
    });
  }
}
