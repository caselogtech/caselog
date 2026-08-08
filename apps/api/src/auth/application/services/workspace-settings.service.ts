import { Inject, Injectable } from '@nestjs/common';
import {
  workspaceSettingsResponseSchema,
  type DeleteWorkspaceRequest,
  type OrganizationAccessPrincipal,
  type UpdateWorkspaceRequest,
  type WorkspaceSettingsResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { WorkspaceSettingsRepository } from '../../infrastructure/repositories/workspace-settings.repository';

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @Inject(WorkspaceSettingsRepository)
    private readonly workspaces: WorkspaceSettingsRepository,
  ) {}

  async get(principal: OrganizationAccessPrincipal): Promise<WorkspaceSettingsResponse> {
    this.assertOrganizationSession(principal);
    const workspace = await this.workspaces.findActive(principal.organizationId);
    if (!workspace) throw new ResourceNotFoundError('workspace');
    return workspaceSettingsResponseSchema.parse({ workspace });
  }

  async update(
    principal: OrganizationAccessPrincipal,
    request: UpdateWorkspaceRequest,
  ): Promise<WorkspaceSettingsResponse> {
    this.assertOrganizationSession(principal);
    if (!['owner', 'admin'].includes(principal.role)) throw new AuthorizationDeniedError();
    const result = await this.workspaces.update(principal.organizationId, principal.sub, request);
    if (result.kind === 'not_found') throw new ResourceNotFoundError('workspace');
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError('workspace_slug_taken', 'This workspace URL is unavailable');
    }
    return workspaceSettingsResponseSchema.parse({ workspace: result.value });
  }

  async delete(
    principal: OrganizationAccessPrincipal,
    request: DeleteWorkspaceRequest,
  ): Promise<WorkspaceSettingsResponse> {
    this.assertOrganizationSession(principal);
    if (principal.role !== 'owner') throw new AuthorizationDeniedError();
    const result = await this.workspaces.delete(
      principal.organizationId,
      principal.sub,
      request.confirmation,
    );
    if (result.kind === 'not_found') throw new ResourceNotFoundError('workspace');
    if (result.kind === 'confirmation_mismatch') {
      throw new InvalidPayloadError(
        'workspace_confirmation_mismatch',
        'The confirmation must exactly match the workspace name',
      );
    }
    return workspaceSettingsResponseSchema.parse({ workspace: result.value });
  }

  async restore(userId: string, workspaceId: string): Promise<WorkspaceSettingsResponse> {
    const result = await this.workspaces.restore(userId, workspaceId);
    if (result.kind === 'not_found') throw new ResourceNotFoundError('workspace');
    if (result.kind === 'forbidden') throw new AuthorizationDeniedError();
    if (result.kind === 'recovery_window_expired') {
      throw new ResourceConflictError(
        'workspace_recovery_window_expired',
        'The workspace recovery window has expired',
      );
    }
    return workspaceSettingsResponseSchema.parse({ workspace: result.value });
  }

  private assertOrganizationSession(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is Extract<OrganizationAccessPrincipal, { tokenType: 'organization' }> {
    if (principal.tokenType !== 'organization') throw new AuthorizationDeniedError();
  }
}
