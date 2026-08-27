import { Module } from '@nestjs/common';
import { InstanceCapabilitiesService } from './application/services/instance-capabilities.service';
import { createInstanceConfig, INSTANCE_CONFIG } from './infrastructure/config/instance.config';
import { InstanceCapabilitiesController } from './presentation/controllers/instance-capabilities.controller';

@Module({
  controllers: [InstanceCapabilitiesController],
  providers: [
    { provide: INSTANCE_CONFIG, useFactory: createInstanceConfig },
    InstanceCapabilitiesService,
  ],
  exports: [InstanceCapabilitiesService],
})
export class InstanceModule {}
