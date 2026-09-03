import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  billingAccountListResponseSchema,
  createBillingAccountResponseSchema,
  type BillingAccountListResponse,
  type CreateBillingAccountRequest,
  type CreateBillingAccountResponse,
  type CreateBillingAccountWorkspaceRequest,
  type CreateBillingAccountWorkspaceResponse,
  type SessionPrincipal,
} from '@caselog/schemas';
import {
  EmailVerificationRequiredError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { AuthService, WorkspaceService } from '../../../auth/public-api';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import { BillingAccountRepository } from '../../infrastructure/repositories/billing-account.repository';

@Injectable()
export class BillingAccountService {
  constructor(
    @Inject(BillingAccountRepository)
    private readonly billingAccounts: BillingAccountRepository,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
  ) {}

  async list(principal: SessionPrincipal): Promise<BillingAccountListResponse> {
    this.assertEnabled();
    return billingAccountListResponseSchema.parse({
      billingAccounts: await this.billingAccounts.listForUser(principal.sub),
    });
  }

  async create(
    principal: SessionPrincipal,
    idempotencyKey: string,
    request: CreateBillingAccountRequest,
  ): Promise<CreateBillingAccountResponse> {
    this.assertEnabled();
    const identity = await this.auth.me(principal);
    if (!identity.emailVerified) throw new EmailVerificationRequiredError();

    const result = await this.billingAccounts.create(
      principal.sub,
      idempotencyKey,
      hashRequest(request),
      request.name,
    );
    if (result.kind === 'idempotency_conflict') throw idempotencyConflict();
    return createBillingAccountResponseSchema.parse({ billingAccount: result.value });
  }

  async createWorkspace(
    principal: SessionPrincipal,
    billingAccountId: string,
    idempotencyKey: string,
    request: CreateBillingAccountWorkspaceRequest,
  ): Promise<CreateBillingAccountWorkspaceResponse> {
    this.assertEnabled();
    const role = await this.billingAccounts.roleForUser(principal.sub, billingAccountId);
    if (!role) throw new ResourceNotFoundError('billing_account');

    return this.workspaces.createForBillingAccount(
      principal.sub,
      billingAccountId,
      idempotencyKey,
      request,
    );
  }

  private assertEnabled(): void {
    if (!this.capabilities.managedBillingEnabled()) {
      throw new ResourceNotFoundError('billing_account');
    }
  }
}

function hashRequest(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

function idempotencyConflict(): ResourceConflictError {
  return new ResourceConflictError(
    'idempotency_conflict',
    'This idempotency key was already used for a different request',
  );
}
