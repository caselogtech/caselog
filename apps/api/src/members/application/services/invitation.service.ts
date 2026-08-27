import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  acceptWorkspaceInvitationResponseSchema,
  createWorkspaceInvitationsResponseSchema,
  workspaceInvitationListResponseSchema,
  workspaceInvitationPreviewSchema,
  workspaceInvitationResponseSchema,
  type AcceptWorkspaceInvitationResponse,
  type CreateWorkspaceInvitationsRequest,
  type CreateWorkspaceInvitationsResponse,
  type OrganizationAccessPrincipal,
  type RegisterInvitationAccountRequest,
  type SessionPrincipal,
  type WorkspaceInvitationListQuery,
  type WorkspaceInvitationListResponse,
  type WorkspaceInvitationPreview,
  type WorkspaceInvitationResponse,
} from '@caselog/schemas';
import { AuthService, type SessionResult } from '../../../auth/public-api';
import {
  AuthorizationDeniedError,
  InvalidAccountTokenError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { MailService } from '../../../core/mail/application/services/mail.service';
import {
  createInvitationToken,
  hashInvitationToken,
  invitationOrganizationId,
} from '../../domain/models/invitation-token';
import {
  INVITATION_CONFIG,
  type InvitationConfig,
} from '../../infrastructure/config/invitation.config';
import {
  InvitationRepository,
  type CreateInvitationsResult,
} from '../../infrastructure/repositories/invitation.repository';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @Inject(InvitationRepository) private readonly invitations: InvitationRepository,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(INVITATION_CONFIG) private readonly config: InvitationConfig,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async createMany(
    principal: OrganizationAccessPrincipal,
    request: CreateWorkspaceInvitationsRequest,
  ): Promise<CreateWorkspaceInvitationsResponse> {
    this.assertManager(principal);
    const prepared = request.invitations.map((invitation) => {
      const token = createInvitationToken(principal.organizationId);
      return {
        ...invitation,
        token,
        tokenHash: hashInvitationToken(token),
        expiresAt: this.expiresAt(),
      };
    });
    const result = await this.invitations.createMany(
      principal.organizationId,
      principal.membershipId,
      principal.sub,
      prepared,
    );
    this.assertCreated(result);
    await Promise.all(result.value.map((delivery) => this.deliverSafely(delivery)));
    return createWorkspaceInvitationsResponseSchema.parse({
      invitations: result.value.map(({ invitation }) => invitation),
    });
  }

  async list(
    principal: OrganizationAccessPrincipal,
    query: WorkspaceInvitationListQuery,
  ): Promise<WorkspaceInvitationListResponse> {
    this.assertManager(principal);
    const result = await this.invitations.list(principal.organizationId, query);
    if (!result) throw new ResourceNotFoundError('invitation_cursor');
    return workspaceInvitationListResponseSchema.parse(result);
  }

  async resend(
    principal: OrganizationAccessPrincipal,
    invitationId: string,
  ): Promise<WorkspaceInvitationResponse> {
    this.assertManager(principal);
    const token = createInvitationToken(principal.organizationId);
    const result = await this.invitations.resend(
      principal.organizationId,
      principal.membershipId,
      principal.sub,
      invitationId,
      token,
      hashInvitationToken(token),
      this.expiresAt(),
    );
    if (result.kind === 'not_found') throw new ResourceNotFoundError('workspace_invitation');
    if (result.kind === 'forbidden') throw new AuthorizationDeniedError();
    if (result.kind === 'member_exists') throw this.memberExists();
    if (result.kind !== 'found') throw new InvalidAccountTokenError();
    await this.deliverSafely(result.value);
    return workspaceInvitationResponseSchema.parse({ invitation: result.value.invitation });
  }

  async revoke(principal: OrganizationAccessPrincipal, invitationId: string): Promise<void> {
    this.assertManager(principal);
    const result = await this.invitations.revoke(
      principal.organizationId,
      principal.membershipId,
      principal.sub,
      invitationId,
    );
    if (result.kind === 'not_found') throw new ResourceNotFoundError('workspace_invitation');
    if (result.kind === 'forbidden') throw new AuthorizationDeniedError();
  }

  async preview(token: string): Promise<WorkspaceInvitationPreview> {
    const organizationId = invitationOrganizationId(token);
    if (!organizationId) throw new InvalidAccountTokenError();
    const preview = await this.invitations.preview(organizationId, hashInvitationToken(token));
    if (!preview) throw new InvalidAccountTokenError();
    return workspaceInvitationPreviewSchema.parse(preview);
  }

  async registerAccount(
    token: string,
    request: RegisterInvitationAccountRequest,
  ): Promise<SessionResult> {
    const invitation = await this.preview(token);
    return this.auth.registerInvitedAccount({
      email: invitation.email,
      displayName: request.displayName,
      password: request.password,
      termsAccepted: request.termsAccepted,
    });
  }

  async accept(
    principal: SessionPrincipal,
    token: string,
  ): Promise<AcceptWorkspaceInvitationResponse> {
    const organizationId = invitationOrganizationId(token);
    if (!organizationId) throw new InvalidAccountTokenError();
    const result = await this.invitations.accept(
      organizationId,
      hashInvitationToken(token),
      principal.sub,
    );
    if (result.kind === 'email_mismatch') throw new AuthorizationDeniedError();
    if (result.kind === 'member_exists') throw this.memberExists();
    if (result.kind !== 'accepted') throw new InvalidAccountTokenError();
    return acceptWorkspaceInvitationResponseSchema.parse(result.value);
  }

  private assertCreated(
    result: CreateInvitationsResult,
  ): asserts result is Extract<CreateInvitationsResult, { kind: 'created' }> {
    if (result.kind === 'forbidden') throw new AuthorizationDeniedError();
    if (result.kind === 'member_exists') {
      throw new ResourceConflictError(
        'member_already_active',
        'An active workspace member already uses this email address',
        { email: result.email },
      );
    }
  }

  private assertManager(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is Extract<OrganizationAccessPrincipal, { tokenType: 'organization' }> {
    if (principal.tokenType !== 'organization' || !['owner', 'admin'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private expiresAt(): Date {
    return new Date(Date.now() + this.config.ttlDays * 86_400_000);
  }

  private async deliverSafely(delivery: {
    invitation: { email: string; role: string };
    token: string;
    workspaceName: string;
    inviterName: string;
  }): Promise<void> {
    try {
      const link = new URL(`/auth/invite/${delivery.token}`, this.config.webBaseUrl);
      await this.mail.sendWorkspaceInvitation(
        delivery.invitation.email,
        delivery.inviterName,
        delivery.workspaceName,
        delivery.invitation.role.replace('_', '-'),
        link.toString(),
        this.config.ttlDays,
      );
    } catch {
      this.logger.warn({ event: 'membership.invitation.delivery_failed' });
    }
  }

  private memberExists(): ResourceConflictError {
    return new ResourceConflictError(
      'member_already_active',
      'This account is already an active workspace member',
    );
  }
}
