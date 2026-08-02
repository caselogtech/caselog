import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { AuthApi } from '../auth-api';
import { ResetPassword } from './reset';

describe('ResetPassword', () => {
  const authApi = { resetPassword: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    authApi.resetPassword.mockReset();
    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 'a'.repeat(43) }) } },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('does not submit passwords that do not match', () => {
    const fixture = TestBed.createComponent(ResetPassword);
    fixture.componentInstance.form.setValue({
      password: 'correct horse battery staple',
      confirmPassword: 'a different password phrase',
    });
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(authApi.resetPassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.field-error')?.textContent).toContain(
      'Passwords do not match',
    );
  });

  it('submits the opaque token with a valid new password', async () => {
    authApi.resetPassword.mockResolvedValue({ message: 'Password reset.' });
    const fixture = TestBed.createComponent(ResetPassword);
    fixture.componentInstance.form.setValue({
      password: 'correct horse battery staple',
      confirmPassword: 'correct horse battery staple',
    });
    fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'a'.repeat(43),
      password: 'correct horse battery staple',
    });
  });
});
