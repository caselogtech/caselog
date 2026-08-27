import type { InstanceCapabilities } from '@caselog/schemas';
import { describe, expect, it } from 'vitest';
import { InstanceCapabilitiesService } from '../../application/services/instance-capabilities.service';

describe('InstanceCapabilitiesService', () => {
  it('exposes self-hosted operation without managed-only billing', () => {
    const capabilities: InstanceCapabilities = {
      deployment: 'self_hosted',
      instanceName: 'Northstar Caselog',
      registrationMode: 'invitation_only',
      workspaceCreationEnabled: false,
      managedBillingEnabled: false,
    };
    const service = new InstanceCapabilitiesService(capabilities);

    expect(service.current()).toEqual(capabilities);
    expect(service.publicRegistrationEnabled()).toBe(false);
    expect(service.workspaceCreationEnabled()).toBe(false);
    expect(service.managedTermsRequired()).toBe(false);
  });

  it('requires managed terms for a managed deployment', () => {
    const service = new InstanceCapabilitiesService({
      deployment: 'managed',
      instanceName: 'Caselog Cloud',
      registrationMode: 'public',
      workspaceCreationEnabled: true,
      managedBillingEnabled: true,
    });

    expect(service.publicRegistrationEnabled()).toBe(true);
    expect(service.managedTermsRequired()).toBe(true);
  });
});
