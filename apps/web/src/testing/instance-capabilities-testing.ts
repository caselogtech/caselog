import { computed, signal } from '@angular/core';
import type { InstanceCapabilities } from '@caselog/schemas';

const DEFAULT_CAPABILITIES: InstanceCapabilities = {
  deployment: 'self_hosted',
  instanceName: 'Test Caselog',
  registrationMode: 'public',
  workspaceCreationEnabled: true,
  managedBillingEnabled: false,
};

export function instanceCapabilitiesTestingValue(overrides: Partial<InstanceCapabilities> = {}) {
  const value = signal({ ...DEFAULT_CAPABILITIES, ...overrides });
  return {
    value: value.asReadonly(),
    loaded: computed(() => true),
    publicRegistrationEnabled: computed(() => value().registrationMode === 'public'),
    workspaceCreationEnabled: computed(() => value().workspaceCreationEnabled),
    managedTermsRequired: computed(() => value().deployment === 'managed'),
    load: async () => undefined,
    update: (next: Partial<InstanceCapabilities>) =>
      value.update((current) => ({ ...current, ...next })),
  };
}
