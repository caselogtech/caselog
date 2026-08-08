import { Inject, Injectable } from '@nestjs/common';
import {
  workspaceMemberListResponseSchema,
  workspaceMemberResponseSchema,
  type ManageableWorkspaceRole,
  type OrganizationAccessPrincipal,
  type WorkspaceMemberListQuery,
  type WorkspaceMemberListResponse,
  type WorkspaceMemberResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { MemberRepository } from '../../infrastructure/repositories/member.repository';

@Injectable()
export class MemberService {
  constructor(@Inject(MemberRepository) private readonly members: MemberRepository) {}

  async list(
    principal: OrganizationAccessPrincipal,
    query: WorkspaceMemberListQuery,
  ): Promise<WorkspaceMemberListResponse> {
    this.assertUserPrincipal(principal);
    const result = await this.members.list(principal.organizationId, query);
    if (!result) throw new ResourceNotFoundError('member_cursor');
    return workspaceMemberListResponseSchema.parse(result);
  }

  async updateRole(
    principal: OrganizationAccessPrincipal,
    membershipId: string,
    role: ManageableWorkspaceRole,
  ): Promise<WorkspaceMemberResponse> {
    this.assertManager(principal);
    return this.handleMutation(
      await this.members.updateRole(
        principal.organizationId,
        principal.membershipId,
        principal.sub,
        membershipId,
        role,
      ),
    );
  }

  async deactivate(principal: OrganizationAccessPrincipal, membershipId: string): Promise<void> {
    this.assertManager(principal);
    this.handleMutation(
      await this.members.setActive(
        principal.organizationId,
        principal.membershipId,
        principal.sub,
        membershipId,
        false,
      ),
    );
  }

  async activate(
    principal: OrganizationAccessPrincipal,
    membershipId: string,
  ): Promise<WorkspaceMemberResponse> {
    this.assertManager(principal);
    return this.handleMutation(
      await this.members.setActive(
        principal.organizationId,
        principal.membershipId,
        principal.sub,
        membershipId,
        true,
      ),
    );
  }

  async transferOwnership(
    principal: OrganizationAccessPrincipal,
    membershipId: string,
  ): Promise<WorkspaceMemberResponse> {
    this.assertManager(principal);
    return this.handleMutation(
      await this.members.transferOwnership(
        principal.organizationId,
        principal.membershipId,
        principal.sub,
        membershipId,
      ),
    );
  }

  private handleMutation(
    result:
      | { kind: 'found'; value: WorkspaceMemberResponse['member'] }
      | { kind: 'not_found' }
      | { kind: 'forbidden' },
  ): WorkspaceMemberResponse {
    if (result.kind === 'not_found') throw new ResourceNotFoundError('member');
    if (result.kind === 'forbidden') throw new AuthorizationDeniedError();
    return workspaceMemberResponseSchema.parse({ member: result.value });
  }

  private assertUserPrincipal(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is Extract<OrganizationAccessPrincipal, { tokenType: 'organization' }> {
    if (principal.tokenType !== 'organization') throw new AuthorizationDeniedError();
  }

  private assertManager(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is Extract<OrganizationAccessPrincipal, { tokenType: 'organization' }> {
    this.assertUserPrincipal(principal);
    if (!['owner', 'admin'].includes(principal.role)) throw new AuthorizationDeniedError();
  }
}
