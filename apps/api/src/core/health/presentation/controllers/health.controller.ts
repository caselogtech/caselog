import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@caselog/schemas';
import { ApiOkResponse } from '@nestjs/swagger';
import { HealthService } from '../../application/services/health.service';
import { HealthResponseDto } from '../dto/health-response.dto';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): Promise<HealthResponse> {
    return this.healthService.getHealth();
  }
}
