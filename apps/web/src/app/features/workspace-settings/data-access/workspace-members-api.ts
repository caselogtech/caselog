import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createWorkspaceInvitationsResponseSchema,
  workspaceInvitationListResponseSchema,
  workspaceInvitationResponseSchema,
  workspaceMemberListResponseSchema,
  workspaceMemberResponseSchema,
  type CreateWorkspaceInvitationsRequest,
  type CreateWorkspaceInvitationsResponse,
  type ManageableWorkspaceRole,
  type WorkspaceInvitationListResponse,
  type WorkspaceMemberListResponse,
  type WorkspaceMemberResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceMembersApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async members(
    workspaceSlug: string,
    state: 'active' | 'inactive',
    cursor?: string,
  ): Promise<WorkspaceMemberListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/members', {
        params: { state, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
    return workspaceMemberListResponseSchema.parse(response);
  }

  async updateRole(
    workspaceSlug: string,
    membershipId: string,
    role: ManageableWorkspaceRole,
  ): Promise<WorkspaceMemberResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.patch<unknown>(`/api/v1/members/${encodeURIComponent(membershipId)}`, { role }),
    );
    return workspaceMemberResponseSchema.parse(response);
  }

  async deactivate(workspaceSlug: string, membershipId: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(`/api/v1/members/${encodeURIComponent(membershipId)}`),
    );
  }

  async activate(workspaceSlug: string, membershipId: string): Promise<WorkspaceMemberResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(`/api/v1/members/${encodeURIComponent(membershipId)}/activate`, {}),
    );
    return workspaceMemberResponseSchema.parse(response);
  }

  async transferOwnership(
    workspaceSlug: string,
    membershipId: string,
  ): Promise<WorkspaceMemberResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/members/${encodeURIComponent(membershipId)}/transfer-ownership`,
        {},
      ),
    );
    return workspaceMemberResponseSchema.parse(response);
  }

  async invitations(
    workspaceSlug: string,
    cursor?: string,
  ): Promise<WorkspaceInvitationListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/members/invitations', {
        params: { status: 'all', limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
    return workspaceInvitationListResponseSchema.parse(response);
  }

  async createInvitations(
    workspaceSlug: string,
    request: CreateWorkspaceInvitationsRequest,
  ): Promise<CreateWorkspaceInvitationsResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/members/invitations', request),
    );
    return createWorkspaceInvitationsResponseSchema.parse(response);
  }

  async resendInvitation(workspaceSlug: string, invitationId: string) {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/members/invitations/${encodeURIComponent(invitationId)}/resend`,
        {},
      ),
    );
    return workspaceInvitationResponseSchema.parse(response);
  }

  async revokeInvitation(workspaceSlug: string, invitationId: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(`/api/v1/members/invitations/${encodeURIComponent(invitationId)}`),
    );
  }
}
