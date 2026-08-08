import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type {
  CreateWorkspaceResponse,
  SessionPrincipal,
  WorkspaceListResponse,
  WorkspaceSlugAvailabilityResponse,
  WorkspaceSettingsResponse,
} from '@caselog/schemas';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateWorkspaceRequestDto,
  WorkspaceIdParamsDto,
  WorkspaceListQueryDto,
  WorkspaceSlugAvailabilityQueryDto,
} from '../dto/auth.dto';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentSession } from '../decorators/session-principal.decorator';
import { WorkspaceService } from '../../application/services/workspace.service';
import { WorkspaceSettingsService } from '../../application/services/workspace-settings.service';
import {
  CreateWorkspaceResponseDto,
  WorkspaceListResponseDto,
  WorkspaceSlugAvailabilityResponseDto,
  WorkspaceSettingsResponseDto,
} from '../dto/auth-response.dto';

@Controller('auth/workspaces')
@UseGuards(SessionAuthGuard)
@ApiBearerAuth('access-token')
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(WorkspaceSettingsService)
    private readonly workspaceSettings: WorkspaceSettingsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceListResponseDto })
  list(
    @CurrentSession() principal: SessionPrincipal,
    @Query() query: WorkspaceListQueryDto,
  ): Promise<WorkspaceListResponse> {
    return this.workspaces.list(principal.sub, query);
  }

  @Get('slug-availability')
  @ApiOkResponse({ type: WorkspaceSlugAvailabilityResponseDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  slugAvailability(
    @Query() query: WorkspaceSlugAvailabilityQueryDto,
  ): Promise<WorkspaceSlugAvailabilityResponse> {
    return this.workspaces.slugAvailability(query.slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreateWorkspaceResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentSession() principal: SessionPrincipal,
    @Body() request: CreateWorkspaceRequestDto,
  ): Promise<CreateWorkspaceResponse> {
    return this.workspaces.create(principal.sub, request);
  }

  @Post(':workspaceId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  restore(
    @CurrentSession() principal: SessionPrincipal,
    @Param() params: WorkspaceIdParamsDto,
  ): Promise<WorkspaceSettingsResponse> {
    return this.workspaceSettings.restore(principal.sub, params.workspaceId);
  }
}
