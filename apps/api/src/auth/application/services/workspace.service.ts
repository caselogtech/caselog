import { createHash } from 'node:crypto';
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
  BillingAccountRequiredError,
  EmailVerificationRequiredError,
  InvalidSessionError,
  ResourceConflictError,
  WorkspaceCreationDisabledError,
} from '../../../common/errors/domain.error';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import {
  WORKSPACE_PROVISIONING_CONFIG,
  type WorkspaceProvisioningConfig,
} from '../../infrastructure/config/workspace-provisioning.config';
import { IdentityRepository } from '../../infrastructure/repositories/identity.repository';
import { WorkspaceRepository } from '../../infrastructure/repositories/workspace.repository';

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(IdentityRepository) private readonly identities: IdentityRepository,
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
    @Inject(WORKSPACE_PROVISIONING_CONFIG)
    private readonly provisioningConfig: WorkspaceProvisioningConfig,
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
    if (this.capabilities.managedBillingEnabled()) {
      throw new BillingAccountRequiredError();
    }
    return this.provision(userId, request, null, this.provisioningConfig.maximumWorkspacesPerUser);
  }

  async createForBillingAccount(
    userId: string,
    billingAccountId: string,
    idempotencyKey: string,
    request: CreateWorkspaceRequest,
  ): Promise<CreateWorkspaceResponse> {
    return this.provision(userId, request, billingAccountId, null, {
      key: idempotencyKey,
      requestHash: hashRequest(request),
      scope: `billing-account:${billingAccountId}:workspaces:create`,
    });
  }

  private async provision(
    userId: string,
    request: CreateWorkspaceRequest,
    billingAccountId: string | null,
    maximumWorkspacesPerUser: number | null,
    idempotency?: { key: string; requestHash: string; scope: string },
  ): Promise<CreateWorkspaceResponse> {
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

    const result = await this.workspaces.provision(
      userId,
      request.name,
      request.slug,
      billingAccountId,
      maximumWorkspacesPerUser,
      idempotency,
    );
    if (result.kind === 'limit_reached') {
      throw new ResourceConflictError(
        'workspace_limit_reached',
        'This account has reached the configured workspace safety limit',
      );
    }
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError('workspace_slug_taken', 'This workspace URL is unavailable');
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_conflict',
        'This idempotency key was already used for a different request',
      );
    }
    return createWorkspaceResponseSchema.parse(result.value);
  }
}

function hashRequest(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}
