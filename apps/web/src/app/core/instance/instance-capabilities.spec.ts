import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { InstanceCapabilities } from './instance-capabilities';

describe('InstanceCapabilities', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads and exposes the server-owned capability contract', async () => {
    const capabilities = TestBed.inject(InstanceCapabilities);
    const loading = capabilities.load();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/instance/capabilities').flush({
      deployment: 'self_hosted',
      instanceName: 'Northstar Caselog',
      registrationMode: 'invitation_only',
      workspaceCreationEnabled: false,
      managedBillingEnabled: false,
    });
    await loading;

    expect(capabilities.value()?.instanceName).toBe('Northstar Caselog');
    expect(capabilities.publicRegistrationEnabled()).toBe(false);
    expect(capabilities.workspaceCreationEnabled()).toBe(false);
    expect(capabilities.managedTermsRequired()).toBe(false);
  });
});
