import { Global, Module } from '@nestjs/common';
import { MetricsService } from './application/services/metrics.service';
import { RequestContext } from './infrastructure/context/request-context';
import { PinoLoggerService } from './infrastructure/logging/pino-logger.service';
import { MetricsController } from './presentation/controllers/metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, PinoLoggerService, RequestContext],
  exports: [MetricsService, PinoLoggerService, RequestContext],
})
export class ObservabilityModule {}
