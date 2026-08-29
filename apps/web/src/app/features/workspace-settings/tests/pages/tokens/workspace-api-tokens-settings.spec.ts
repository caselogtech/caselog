import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type {
  ApiTokenListResponse,
  ApiTokenSummary,
  CreateApiTokenResponse,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceApiTokensApi } from '../../../data-access/workspace-api-tokens-api';
import { WorkspaceApiTokensSettings } from '../../../pages/tokens/workspace-api-tokens-settings';

const token: ApiTokenSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'GitHub Actions',
  tokenPrefix: 'clg_abcdefgh',
  scopes: ['runs:read'],
  expiresAt: '2026-11-27T08:00:00.000Z',
  lastUsedAt: null,
  createdAt: '2026-08-29T08:00:00.000Z',
  createdBy: {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Ada Lovelace',
  },
};
const listed: ApiTokenListResponse = { apiTokens: [token] };
const created: CreateApiTokenResponse = {
  token: `clg_abcdefgh_${'A'.repeat(43)}`,
  apiToken: token,
};

describe('WorkspaceApiTokensSettings', () => {
  const tokensApi = {
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    tokensApi.list.mockReset().mockResolvedValue(listed);
    tokensApi.create.mockReset().mockResolvedValue(created);
    tokensApi.revoke.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [WorkspaceApiTokensSettings, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApiTokensApi, useValue: tokensApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ org: 'acme' }) },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders active token metadata without exposing a stored secret', async () => {
    const fixture = TestBed.createComponent(WorkspaceApiTokensSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.tokens.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('GitHub Actions');
    expect(text).toContain('clg_abcdefgh');
    expect(text).toContain('Read test runs');
    expect(text).not.toContain(created.token);
  });

  it('creates a scoped token and retains the one-time secret only until acknowledgement', async () => {
    const fixture = TestBed.createComponent(WorkspaceApiTokensSettings);
    fixture.componentInstance.openCreateForm();
    fixture.componentInstance.form.controls.name.setValue('GitHub Actions');
    fixture.componentInstance.form.controls.scopes.controls.runsRead.setValue(true);

    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(fixture.componentInstance.createdToken()).toEqual(created));
    fixture.detectChanges();

    expect(tokensApi.create).toHaveBeenCalledWith(
      'acme',
      expect.objectContaining({
        name: 'GitHub Actions',
        scopes: ['runs:read'],
        expiresAt: expect.stringMatching(/Z$/),
      }),
    );
    expect(fixture.nativeElement.textContent).toContain(created.token);

    fixture.componentInstance.closeSecret();
    fixture.detectChanges();
    expect(fixture.componentInstance.createdToken()).toBeNull();
    expect(fixture.componentInstance.createToken.data()).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain(created.token);
  });

  it('revokes a selected token only after confirmation', async () => {
    const fixture = TestBed.createComponent(WorkspaceApiTokensSettings);
    fixture.componentInstance.requestRevoke(token);
    expect(tokensApi.revoke).not.toHaveBeenCalled();

    fixture.componentInstance.confirmRevoke();
    await vi.waitFor(() => expect(tokensApi.revoke).toHaveBeenCalledWith('acme', token.id));
    await vi.waitFor(() => expect(fixture.componentInstance.revokeTarget()).toBeNull());
  });

  it('requires at least one scope and a non-empty name', () => {
    const fixture = TestBed.createComponent(WorkspaceApiTokensSettings);
    fixture.componentInstance.openCreateForm();
    fixture.componentInstance.form.controls.name.setValue('   ');

    fixture.componentInstance.submit();

    expect(tokensApi.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.controls.name.touched).toBe(true);
    expect(fixture.componentInstance.form.controls.scopes.invalid).toBe(true);
  });
});
