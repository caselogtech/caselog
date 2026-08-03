import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CreateWorkspaceResponse,
  SessionPrincipal,
  WorkspaceListResponse,
  WorkspaceSlugAvailabilityResponse,
} from '@caselog/schemas';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { CreateWorkspaceRequestDto, WorkspaceSlugAvailabilityQueryDto } from '../dto/auth.dto';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentSession } from '../decorators/session-principal.decorator';
import { WorkspaceService } from '../../application/services/workspace.service';

@Controller('auth/workspaces')
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly workspaces: WorkspaceService) {}

  @Get()
  list(@CurrentSession() principal: SessionPrincipal): Promise<WorkspaceListResponse> {
    return this.workspaces.list(principal.sub);
  }

  @Get('slug-availability')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  slugAvailability(
    @Query() query: WorkspaceSlugAvailabilityQueryDto,
  ): Promise<WorkspaceSlugAvailabilityResponse> {
    return this.workspaces.slugAvailability(query.slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentSession() principal: SessionPrincipal,
    @Body() request: CreateWorkspaceRequestDto,
  ): Promise<CreateWorkspaceResponse> {
    return this.workspaces.create(principal.sub, request);
  }
}
