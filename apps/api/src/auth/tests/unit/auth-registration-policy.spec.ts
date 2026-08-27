import { describe, expect, it } from 'vitest';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import { AuthService } from '../../application/services/auth.service';
import { WorkspaceService } from '../../application/services/workspace.service';

const registration = {
  displayName: 'New User',
  email: 'new-user@example.com',
  password: 'correct horse battery staple',
  termsAccepted: false,
};

describe('auth instance policies', () => {
  it('rejects public registration when the instance is invitation-only', async () => {
    const service = authService(capabilities({ registrationMode: 'invitation_only' }));

    await expect(service.register(registration)).rejects.toMatchObject({
      code: 'registration_disabled',
    });
  });

  it('requires terms for public and invited registration only on managed operation', async () => {
    const service = authService(capabilities({ deployment: 'managed' }));

    await expect(service.register(registration)).rejects.toMatchObject({
      code: 'managed_terms_required',
    });
    await expect(service.registerInvitedAccount(registration)).rejects.toMatchObject({
      code: 'managed_terms_required',
    });
  });

  it('rejects workspace provisioning when the instance disables it', async () => {
    const service = new WorkspaceService(
      {} as never,
      {} as never,
      capabilities({ workspaceCreationEnabled: false }),
    );

    await expect(
      service.create('e1243c05-c62a-4f74-9719-ae8e498cbfcc', {
        name: 'Blocked Workspace',
        slug: 'blocked-workspace',
      }),
    ).rejects.toMatchObject({ code: 'workspace_creation_disabled' });
  });
});

function authService(instanceCapabilities: InstanceCapabilitiesService): AuthService {
  return new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    instanceCapabilities,
  );
}

function capabilities(
  overrides: Partial<ConstructorParameters<typeof InstanceCapabilitiesService>[0]>,
): InstanceCapabilitiesService {
  return new InstanceCapabilitiesService({
    deployment: 'self_hosted',
    instanceName: 'Test Caselog',
    registrationMode: 'public',
    workspaceCreationEnabled: true,
    managedBillingEnabled: false,
    ...overrides,
  });
}
