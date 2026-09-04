import { Inject, Injectable } from '@nestjs/common';
import {
  staffAuditLogListResponseSchema,
  staffBillingAccountListResponseSchema,
  staffOperatorListResponseSchema,
  staffOperatorResponseSchema,
  staffOverviewResponseSchema,
  staffSessionResponseSchema,
  staffUserListResponseSchema,
  staffWorkspaceListResponseSchema,
  type GrantStaffOperatorRequest,
  type RevokeStaffOperatorRequest,
  type StaffAuditLogListResponse,
  type StaffBillingAccountListResponse,
  type StaffListQuery,
  type StaffOperator,
  type StaffOperatorListResponse,
  type StaffOperatorResponse,
  type StaffOverviewResponse,
  type StaffSessionResponse,
  type StaffUserListResponse,
  type StaffWorkspaceListResponse,
} from '@caselog/schemas';
import {
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import { isValidStaffAccessExpiry } from '../../domain/policies/staff-access.policy';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';

@Injectable()
export class StaffConsoleService {
  constructor(
    @Inject(StaffRepository) private readonly staff: StaffRepository,
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
  ) {}

  session(operator: StaffOperator): StaffSessionResponse {
    return staffSessionResponseSchema.parse({ operator });
  }

  async overview(operator: StaffOperator): Promise<StaffOverviewResponse> {
    const overview = await this.staff.overview(operator.userId);
    return staffOverviewResponseSchema.parse({
      ...overview,
      configuration: this.capabilities.current(),
    });
  }

  async users(operator: StaffOperator, query: StaffListQuery): Promise<StaffUserListResponse> {
    const page = await this.staff.listUsers(operator.userId, query);
    return staffUserListResponseSchema.parse({ users: page.items, nextCursor: page.nextCursor });
  }

  async workspaces(
    operator: StaffOperator,
    query: StaffListQuery,
  ): Promise<StaffWorkspaceListResponse> {
    const page = await this.staff.listWorkspaces(operator.userId, query);
    return staffWorkspaceListResponseSchema.parse({
      workspaces: page.items,
      nextCursor: page.nextCursor,
    });
  }

  async billingAccounts(
    operator: StaffOperator,
    query: StaffListQuery,
  ): Promise<StaffBillingAccountListResponse> {
    const page = await this.staff.listBillingAccounts(operator.userId, query);
    return staffBillingAccountListResponseSchema.parse({
      billingAccounts: page.items,
      nextCursor: page.nextCursor,
    });
  }

  async operators(
    operator: StaffOperator,
    query: StaffListQuery,
  ): Promise<StaffOperatorListResponse> {
    const page = await this.staff.listOperators(operator.userId, query);
    return staffOperatorListResponseSchema.parse({
      operators: page.items,
      nextCursor: page.nextCursor,
    });
  }

  async grantOperator(
    operator: StaffOperator,
    request: GrantStaffOperatorRequest,
  ): Promise<StaffOperatorResponse> {
    const expiresAt = new Date(request.accessExpiresAt);
    if (!isValidStaffAccessExpiry(expiresAt)) {
      throw new InvalidPayloadError(
        'invalid_staff_access_expiry',
        'Choose an access expiry in the future and no more than 90 days away',
      );
    }

    const result = await this.staff.grantOperator(operator.userId, request);
    if (result.kind === 'user_not_found') throw new ResourceNotFoundError('verified_user');
    if (result.kind === 'invalid_expiry') {
      throw new InvalidPayloadError(
        'invalid_staff_access_expiry',
        'Choose an access expiry in the future and no more than 90 days away',
      );
    }
    if (result.kind === 'last_owner') throw lastOwnerError();
    if (result.kind !== 'ok') throw new ResourceNotFoundError('staff_operator');
    return staffOperatorResponseSchema.parse({ operator: result.operator });
  }

  async revokeOperator(
    operator: StaffOperator,
    targetUserId: string,
    request: RevokeStaffOperatorRequest,
  ): Promise<void> {
    const result = await this.staff.revokeOperator(operator.userId, targetUserId, request.reason);
    if (result.kind === 'not_found') throw new ResourceNotFoundError('staff_operator');
    if (result.kind === 'self_revoke') {
      throw new ResourceConflictError(
        'staff_operator_self_revoke',
        'Use another owner to revoke your staff access',
      );
    }
    if (result.kind === 'last_owner') throw lastOwnerError();
  }

  async auditLogs(
    operator: StaffOperator,
    query: StaffListQuery,
  ): Promise<StaffAuditLogListResponse> {
    const page = await this.staff.listAuditLogs(operator.userId, query);
    return staffAuditLogListResponseSchema.parse({
      auditLogs: page.items,
      nextCursor: page.nextCursor,
    });
  }
}

function lastOwnerError(): ResourceConflictError {
  return new ResourceConflictError(
    'staff_last_owner_required',
    'At least one active staff owner must remain',
  );
}
