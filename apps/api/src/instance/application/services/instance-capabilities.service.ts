import { Inject, Injectable } from '@nestjs/common';
import type { InstanceCapabilities } from '@caselog/schemas';
import { INSTANCE_CONFIG } from '../../infrastructure/config/instance.config';

@Injectable()
export class InstanceCapabilitiesService {
  constructor(@Inject(INSTANCE_CONFIG) private readonly capabilities: InstanceCapabilities) {}

  current(): InstanceCapabilities {
    return this.capabilities;
  }

  publicRegistrationEnabled(): boolean {
    return this.capabilities.registrationMode === 'public';
  }

  workspaceCreationEnabled(): boolean {
    return this.capabilities.workspaceCreationEnabled;
  }

  managedBillingEnabled(): boolean {
    return this.capabilities.managedBillingEnabled;
  }

  managedTermsRequired(): boolean {
    return this.capabilities.deployment === 'managed';
  }
}
