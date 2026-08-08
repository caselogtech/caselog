import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuditLogListResponse, OrganizationAccessPrincipal } from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { AuditLogService } from '../../application/services/audit-log.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { AuditLogListQueryDto } from '../dto/audit-log.dto';
import { AuditLogListResponseDto } from '../dto/audit-log-response.dto';

@Controller('audit-logs')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@RequireOrganizationAccess('admin')
@ApiBearerAuth('access-token')
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly auditLogs: AuditLogService) {}

  @Get()
  @ApiOkResponse({ type: AuditLogListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Query() query: AuditLogListQueryDto,
  ): Promise<AuditLogListResponse> {
    return this.auditLogs.list(principal, query);
  }
}
