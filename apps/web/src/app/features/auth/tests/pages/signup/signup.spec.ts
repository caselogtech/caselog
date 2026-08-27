import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type {
  InstanceCapabilities as InstanceCapabilityValue,
  SessionResponse,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { InstanceCapabilities } from '../../../../../core/instance/instance-capabilities';
import { instanceCapabilitiesTestingValue } from '../../../../../../testing/instance-capabilities-testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { AuthApi } from '../../../data-access/auth-api';
import { Signup } from '../../../pages/signup/signup';

const token = `clgi_65f3ec68-2560-46bf-8845-8b10c7ce8ec1_${'a'.repeat(43)}`;
const session: SessionResponse = {
  accessToken: 'access-token',
  expiresAt: '2026-08-27T21:00:00.000Z',
  user: {
    id: 'e1243c05-c62a-4f74-9719-ae8e498cbfcc',
    email: 'invitee@example.com',
    displayName: 'Invitee',
    emailVerified: false,
  },
};

describe('Signup', () => {
  const authApi = {
    register: vi.fn(),
    registerInvitationAccount: vi.fn(),
  };
  let queryClient: QueryClient;

  afterEach(() => queryClient?.clear());

  async function setup(capabilities: Partial<InstanceCapabilityValue> = {}, returnUrl?: string) {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    authApi.register.mockReset();
    authApi.registerInvitationAccount.mockReset();
    await TestBed.configureTestingModule({
      imports: [Signup, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        {
          provide: InstanceCapabilities,
          useValue: instanceCapabilitiesTestingValue(capabilities),
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
          },
        },
      ],
    }).compileComponents();
    return TestBed.createComponent(Signup);
  }

  it('registers publicly on self-hosted without managed terms', async () => {
    const fixture = await setup();
    authApi.register.mockResolvedValue(session);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({
      displayName: 'Invitee',
      email: 'invitee@example.com',
      password: 'correct horse battery staple',
      termsAccepted: false,
    });

    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/verify'));

    expect(fixture.nativeElement.querySelector('[type="checkbox"]')).toBeNull();
    expect(authApi.register).toHaveBeenCalledWith({
      displayName: 'Invitee',
      email: 'invitee@example.com',
      password: 'correct horse battery staple',
      termsAccepted: false,
    });
  });

  it('shows an invitation-only state for public sign-up', async () => {
    const fixture = await setup({ registrationMode: 'invitation_only' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.registration-message')?.textContent).toContain(
      'Registration is invitation only',
    );
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('registers the recipient through a valid invitation when public sign-up is disabled', async () => {
    const returnUrl = `/auth/invite/${token}`;
    const fixture = await setup({ registrationMode: 'invitation_only' }, returnUrl);
    authApi.registerInvitationAccount.mockResolvedValue(session);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({
      displayName: 'Invitee',
      email: '',
      password: 'correct horse battery staple',
      termsAccepted: false,
    });

    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(returnUrl));

    expect(fixture.nativeElement.querySelector('#email')).toBeNull();
    expect(authApi.registerInvitationAccount).toHaveBeenCalledWith(token, {
      displayName: 'Invitee',
      password: 'correct horse battery staple',
      termsAccepted: false,
    });
  });

  it('requires terms only for a managed deployment', async () => {
    const fixture = await setup({ deployment: 'managed' });
    fixture.detectChanges();
    fixture.componentInstance.form.patchValue({
      displayName: 'Invitee',
      email: 'invitee@example.com',
      password: 'correct horse battery staple',
    });
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[type="checkbox"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#terms-error')?.textContent).toContain(
      'Accept the terms',
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });
});
