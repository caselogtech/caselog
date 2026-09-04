import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type {
  StaffAuditLogListResponse,
  StaffBillingAccountListResponse,
  StaffOperator,
  StaffOperatorListResponse,
  StaffOperatorResponse,
  StaffOverviewResponse,
  StaffSessionResponse,
  StaffUserListResponse,
  StaffWorkspaceListResponse,
} from '@caselog/schemas';
import { SessionAuthGuard } from '../../../auth/public-api';
import { StaffConsoleService } from '../../application/services/staff-console.service';
import { CurrentStaffOperator } from '../decorators/staff-operator.decorator';
import { RequireStaffRole } from '../decorators/staff-role.decorator';
import { StaffAccessGuard } from '../guards/staff-access.guard';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  GrantStaffOperatorRequestDto,
  RevokeStaffOperatorRequestDto,
  StaffListQueryDto,
  StaffOperatorParamsDto,
} from '../dto/staff-request.dto';
import {
  StaffAuditLogListResponseDto,
  StaffBillingAccountListResponseDto,
  StaffOperatorListResponseDto,
  StaffOperatorResponseDto,
  StaffOverviewResponseDto,
  StaffSessionResponseDto,
  StaffUserListResponseDto,
  StaffWorkspaceListResponseDto,
} from '../dto/staff-response.dto';

@Controller('staff')
@UseGuards(SessionAuthGuard, StaffAccessGuard)
@ApiBearerAuth('access-token')
export class StaffController {
  constructor(@Inject(StaffConsoleService) private readonly staff: StaffConsoleService) {}

  @Get('session')
  @ApiOkResponse({ type: StaffSessionResponseDto })
  session(@CurrentStaffOperator() operator: StaffOperator): StaffSessionResponse {
    return this.staff.session(operator);
  }

  @Get('overview')
  @RequireStaffRole('support')
  @ApiOkResponse({ type: StaffOverviewResponseDto })
  overview(@CurrentStaffOperator() operator: StaffOperator): Promise<StaffOverviewResponse> {
    return this.staff.overview(operator);
  }

  @Get('users')
  @RequireStaffRole('admin')
  @ApiOkResponse({ type: StaffUserListResponseDto })
  users(
    @CurrentStaffOperator() operator: StaffOperator,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffUserListResponse> {
    return this.staff.users(operator, query);
  }

  @Get('workspaces')
  @RequireStaffRole('admin')
  @ApiOkResponse({ type: StaffWorkspaceListResponseDto })
  workspaces(
    @CurrentStaffOperator() operator: StaffOperator,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffWorkspaceListResponse> {
    return this.staff.workspaces(operator, query);
  }

  @Get('billing-accounts')
  @RequireStaffRole('admin')
  @ApiOkResponse({ type: StaffBillingAccountListResponseDto })
  billingAccounts(
    @CurrentStaffOperator() operator: StaffOperator,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffBillingAccountListResponse> {
    return this.staff.billingAccounts(operator, query);
  }

  @Get('operators')
  @RequireStaffRole('owner')
  @ApiOkResponse({ type: StaffOperatorListResponseDto })
  operators(
    @CurrentStaffOperator() operator: StaffOperator,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffOperatorListResponse> {
    return this.staff.operators(operator, query);
  }

  @Post('operators')
  @RequireStaffRole('owner')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StaffOperatorResponseDto })
  grantOperator(
    @CurrentStaffOperator() operator: StaffOperator,
    @Body() request: GrantStaffOperatorRequestDto,
  ): Promise<StaffOperatorResponse> {
    return this.staff.grantOperator(operator, request);
  }

  @Delete('operators/:userId')
  @RequireStaffRole('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revokeOperator(
    @CurrentStaffOperator() operator: StaffOperator,
    @Param() params: StaffOperatorParamsDto,
    @Body() request: RevokeStaffOperatorRequestDto,
  ): Promise<void> {
    return this.staff.revokeOperator(operator, params.userId, request);
  }

  @Get('audit-logs')
  @RequireStaffRole('owner')
  @ApiOkResponse({ type: StaffAuditLogListResponseDto })
  auditLogs(
    @CurrentStaffOperator() operator: StaffOperator,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffAuditLogListResponse> {
    return this.staff.auditLogs(operator, query);
  }
}
