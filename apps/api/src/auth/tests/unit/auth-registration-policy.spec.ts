import { describe, expect, it, vi } from 'vitest';
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
      { maximumWorkspacesPerUser: null },
    );

    await expect(
      service.create('e1243c05-c62a-4f74-9719-ae8e498cbfcc', {
        name: 'Blocked Workspace',
        slug: 'blocked-workspace',
      }),
    ).rejects.toMatchObject({ code: 'workspace_creation_disabled' });
  });

  it('requires the billing-account provisioning route on managed billing instances', async () => {
    const service = new WorkspaceService(
      {} as never,
      {} as never,
      capabilities({ deployment: 'managed', managedBillingEnabled: true }),
      { maximumWorkspacesPerUser: null },
    );

    await expect(
      service.create('e1243c05-c62a-4f74-9719-ae8e498cbfcc', {
        name: 'Managed Workspace',
        slug: 'managed-workspace',
      }),
    ).rejects.toMatchObject({ code: 'billing_account_required' });
  });

  it('passes the configured operational limit to atomic workspace provisioning', async () => {
    const provision = vi.fn().mockResolvedValue({ kind: 'limit_reached' });
    const service = new WorkspaceService(
      { provision } as never,
      {
        findById: vi.fn().mockResolvedValue({
          id: 'e1243c05-c62a-4f74-9719-ae8e498cbfcc',
          email: 'verified@example.com',
          displayName: 'Verified User',
          emailVerified: true,
        }),
      } as never,
      capabilities({}),
      { maximumWorkspacesPerUser: 25 },
    );

    await expect(
      service.create('e1243c05-c62a-4f74-9719-ae8e498cbfcc', {
        name: 'Limited Workspace',
        slug: 'limited-workspace',
      }),
    ).rejects.toMatchObject({ code: 'workspace_limit_reached' });
    expect(provision).toHaveBeenCalledWith(
      'e1243c05-c62a-4f74-9719-ae8e498cbfcc',
      'Limited Workspace',
      'limited-workspace',
      null,
      25,
      undefined,
    );
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
