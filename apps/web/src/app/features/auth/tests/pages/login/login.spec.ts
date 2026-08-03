import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { SessionResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { AuthApi } from '../../../data-access/auth-api';
import { Login } from '../../../pages/login/login';

const session: SessionResponse = {
  accessToken: 'access-token',
  expiresAt: '2026-08-02T12:00:00.000Z',
  user: {
    id: '2d17f8de-43a9-4a86-9ccf-65deabed9882',
    email: 'tester@example.com',
    displayName: 'Tester',
    emailVerified: false,
  },
};

describe('Login', () => {
  const authApi = { login: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    authApi.login.mockReset();
    await TestBed.configureTestingModule({
      imports: [Login, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('shows validation feedback without sending an invalid form', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(authApi.login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('.field-error')).toHaveLength(2);
  });

  it('keeps the successful session in tab memory', async () => {
    authApi.login.mockResolvedValue(session);
    const fixture = TestBed.createComponent(Login);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.form.setValue({
      email: 'tester@example.com',
      password: 'correct horse battery staple',
    });
    fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'tester@example.com',
      password: 'correct horse battery staple',
    });
    expect(TestBed.inject(BrowserSession).user()).toEqual(session.user);
    expect(navigate).toHaveBeenCalledWith('/auth/verify');
  });
});
