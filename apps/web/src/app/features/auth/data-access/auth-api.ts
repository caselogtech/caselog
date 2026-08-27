import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  acceptWorkspaceInvitationResponseSchema,
  createWorkspaceResponseSchema,
  emailVerificationResponseSchema,
  messageResponseSchema,
  organizationTokenResponseSchema,
  sessionResponseSchema,
  workspaceInvitationPreviewSchema,
  workspaceListResponseSchema,
  workspaceSettingsResponseSchema,
  workspaceSlugAvailabilityResponseSchema,
  type AcceptWorkspaceInvitationResponse,
  type CreateWorkspaceRequest,
  type CreateWorkspaceResponse,
  type EmailVerificationRequest,
  type EmailVerificationResponse,
  type ForgotPasswordRequest,
  type LoginRequest,
  type MessageResponse,
  type OrganizationTokenResponse,
  type RegisterRequest,
  type RegisterInvitationAccountRequest,
  type ResetPasswordRequest,
  type SessionResponse,
  type WorkspaceListResponse,
  type WorkspaceSettingsResponse,
  type WorkspaceInvitationPreview,
  type WorkspaceSlugAvailabilityResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  async login(request: LoginRequest): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/login', request, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async register(request: RegisterRequest): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/register', request, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async refresh(): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/refresh', null, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async resendEmailVerification(): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/email/verification', null),
    );
    return messageResponseSchema.parse(response);
  }

  async verifyEmail(request: EmailVerificationRequest): Promise<EmailVerificationResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/email/verify', request),
    );
    return emailVerificationResponseSchema.parse(response);
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/password/forgot', request),
    );
    return messageResponseSchema.parse(response);
  }

  async resetPassword(request: ResetPasswordRequest): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/password/reset', request),
    );
    return messageResponseSchema.parse(response);
  }

  async invitationPreview(token: string): Promise<WorkspaceInvitationPreview> {
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/invitations/${encodeURIComponent(token)}`),
    );
    return workspaceInvitationPreviewSchema.parse(response);
  }

  async acceptInvitation(token: string): Promise<AcceptWorkspaceInvitationResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, null),
    );
    return acceptWorkspaceInvitationResponseSchema.parse(response);
  }

  async registerInvitationAccount(
    token: string,
    request: RegisterInvitationAccountRequest,
  ): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/invitations/${encodeURIComponent(token)}/register`,
        request,
        { withCredentials: true },
      ),
    );
    return sessionResponseSchema.parse(response);
  }

  async listWorkspaces(status: 'active' | 'deleted' = 'active'): Promise<WorkspaceListResponse> {
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/auth/workspaces', {
        params: status === 'active' ? {} : { status },
      }),
    );
    return workspaceListResponseSchema.parse(response);
  }

  async restoreWorkspace(workspaceId: string): Promise<WorkspaceSettingsResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/auth/workspaces/${encodeURIComponent(workspaceId)}/restore`,
        {},
      ),
    );
    return workspaceSettingsResponseSchema.parse(response);
  }

  async workspaceSlugAvailability(slug: string): Promise<WorkspaceSlugAvailabilityResponse> {
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/auth/workspaces/slug-availability', {
        params: { slug },
      }),
    );
    return workspaceSlugAvailabilityResponseSchema.parse(response);
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/workspaces', request),
    );
    return createWorkspaceResponseSchema.parse(response);
  }

  async organizationToken(slug: string): Promise<OrganizationTokenResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>(`/api/v1/auth/organizations/${encodeURIComponent(slug)}/token`, null),
    );
    return organizationTokenResponseSchema.parse(response);
  }
}
