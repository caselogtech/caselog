import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@caselog/schemas';
import { PrismaService } from '../../../database/infrastructure/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthResponse> {
    await this.prisma.$queryRaw`SELECT 1`;

    return healthResponseSchema.parse({
      service: 'api',
      status: 'ok',
    });
  }
}
