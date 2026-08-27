import { Inject, Injectable } from '@nestjs/common';
import {
  createWorkspaceResponseSchema,
  organizationSlugSchema,
  workspaceListResponseSchema,
  workspaceSlugAvailabilityResponseSchema,
  type CreateWorkspaceRequest,
  type CreateWorkspaceResponse,
  type WorkspaceListQuery,
  type WorkspaceListResponse,
  type WorkspaceSlugAvailabilityResponse,
} from '@caselog/schemas';
import {
  EmailVerificationRequiredError,
  InvalidSessionError,
  ResourceConflictError,
  WorkspaceCreationDisabledError,
} from '../../../common/errors/domain.error';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import { IdentityRepository } from '../../infrastructure/repositories/identity.repository';
import { WorkspaceRepository } from '../../infrastructure/repositories/workspace.repository';

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(IdentityRepository) private readonly identities: IdentityRepository,
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
  ) {}

  async list(userId: string, query: WorkspaceListQuery): Promise<WorkspaceListResponse> {
    return workspaceListResponseSchema.parse({
      workspaces: await this.workspaces.listForUser(userId, query.status),
    });
  }

  async slugAvailability(slug: string): Promise<WorkspaceSlugAvailabilityResponse> {
    if (!organizationSlugSchema.safeParse(slug).success) {
      return workspaceSlugAvailabilityResponseSchema.parse({ available: false });
    }
    return workspaceSlugAvailabilityResponseSchema.parse({
      available: await this.workspaces.isSlugAvailable(slug),
    });
  }

  async create(userId: string, request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    if (!this.capabilities.workspaceCreationEnabled()) {
      throw new WorkspaceCreationDisabledError();
    }
    const identity = await this.identities.findById(userId);
    if (!identity) {
      throw new InvalidSessionError();
    }
    if (!identity.emailVerified) {
      throw new EmailVerificationRequiredError();
    }

    const result = await this.workspaces.provision(userId, request.name, request.slug);
    if (result.kind === 'limit_reached') {
      throw new ResourceConflictError(
        'workspace_limit_reached',
        'This account has reached its workspace limit',
      );
    }
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError('workspace_slug_taken', 'This workspace URL is unavailable');
    }
    return createWorkspaceResponseSchema.parse(result.value);
  }
}
