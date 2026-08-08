import { Inject, Injectable } from '@nestjs/common';
import {
  auditLogListResponseSchema,
  type AuditLogListQuery,
  type AuditLogListResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository';

@Injectable()
export class AuditLogService {
  constructor(@Inject(AuditLogRepository) private readonly auditLogs: AuditLogRepository) {}

  async list(
    principal: OrganizationAccessPrincipal,
    query: AuditLogListQuery,
  ): Promise<AuditLogListResponse> {
    if (principal.tokenType !== 'organization' || !['owner', 'admin'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
    const result = await this.auditLogs.list(principal.organizationId, query);
    if (!result) throw new ResourceNotFoundError('audit_log_cursor');
    return auditLogListResponseSchema.parse(result);
  }
}
