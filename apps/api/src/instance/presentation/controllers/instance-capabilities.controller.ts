import { Controller, Get, Inject } from '@nestjs/common';
import type { InstanceCapabilities } from '@caselog/schemas';
import { ApiOkResponse } from '@nestjs/swagger';
import { InstanceCapabilitiesService } from '../../application/services/instance-capabilities.service';
import { InstanceCapabilitiesResponseDto } from '../dto/instance-capabilities-response.dto';

@Controller('instance/capabilities')
export class InstanceCapabilitiesController {
  constructor(
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: InstanceCapabilitiesResponseDto })
  getCapabilities(): InstanceCapabilities {
    return this.capabilities.current();
  }
}
