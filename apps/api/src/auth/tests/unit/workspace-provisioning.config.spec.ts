import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceProvisioningConfig } from '../../infrastructure/config/workspace-provisioning.config';

const originalLimit = process.env.CASELOG_MAX_WORKSPACES_PER_USER;

describe('workspace provisioning configuration', () => {
  afterEach(() => {
    if (originalLimit === undefined) delete process.env.CASELOG_MAX_WORKSPACES_PER_USER;
    else process.env.CASELOG_MAX_WORKSPACES_PER_USER = originalLimit;
  });

  it.each([undefined, '', '   '])('defaults %j to unlimited workspace creation', (value) => {
    if (value === undefined) delete process.env.CASELOG_MAX_WORKSPACES_PER_USER;
    else process.env.CASELOG_MAX_WORKSPACES_PER_USER = value;

    expect(createWorkspaceProvisioningConfig()).toEqual({ maximumWorkspacesPerUser: null });
  });

  it('accepts an explicit positive operational limit', () => {
    process.env.CASELOG_MAX_WORKSPACES_PER_USER = '250';

    expect(createWorkspaceProvisioningConfig()).toEqual({ maximumWorkspacesPerUser: 250 });
  });

  it.each(['0', '-1', '1.5', 'unlimited', '100001'])(
    'rejects the invalid operational limit %s',
    (value) => {
      process.env.CASELOG_MAX_WORKSPACES_PER_USER = value;

      expect(() => createWorkspaceProvisioningConfig()).toThrow();
    },
  );
});
