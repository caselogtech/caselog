import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { staffWorkspaceListQuerySchema } from '@caselog/schemas';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  StaffBillingAccountListResponse,
  StaffUserListResponse,
  StaffWorkspaceListResponse,
  StaffWorkspaceListQuery,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState, StatusBadge } from '../../../../shared/ui/public-api';
import { StaffApi } from '../../data-access/staff-api';
import { StaffListHistory } from '../../state/staff-list-history';
import {
  staffDirectoryUrl,
  type StaffDirectoryResource,
} from '../../domain/staff-directory-navigation';
import { StaffSession } from '../../state/staff-session';
import { formatStaffBytes, formatStaffDate } from '../../domain/staff-format';

type DirectoryResource = StaffDirectoryResource;
type DirectoryResponse =
  | StaffUserListResponse
  | StaffWorkspaceListResponse
  | StaffBillingAccountListResponse;

@Component({
  selector: 'app-staff-directory',
  imports: [Button, FormsModule, RouterLink, PageState, StatusBadge, TranslocoPipe],
  templateUrl: './staff-directory.html',
  styleUrl: './staff-directory.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDirectory {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly history = inject(StaffListHistory);
  private readonly staffSession = inject(StaffSession);
  private readonly staffApi = inject(StaffApi);
  // biome-ignore lint/complexity/useLiteralKeys: Angular route data is an index-signature contract.
  readonly resource = readResource(this.route.snapshot.data['resource']);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly query = computed(() =>
    staffWorkspaceListQuerySchema.safeParse({
      q: this.params().get('q') ?? undefined,
      cursor: this.params().get('cursor') ?? undefined,
      limit: this.params().get('limit') ?? undefined,
      state: this.resource === 'workspaces' ? (this.params().get('state') ?? undefined) : 'all',
    }),
  );
  readonly searchDraft = linkedSignal(() => this.params().get('q') ?? '');
  readonly search = computed(() => this.query().data?.q ?? '');
  readonly cursor = computed(() => this.query().data?.cursor);
  readonly workspaceState = computed(() => this.query().data?.state ?? 'all');
  readonly searchError = linkedSignal({ source: this.params, computation: () => false });
  readonly currentUrl = computed(() =>
    staffDirectoryUrl(this.resource, this.query().data ?? { limit: 25, state: 'all' }),
  );
  readonly cardQueryParams = computed(() => ({ returnTo: this.currentUrl() }));
  readonly previousUrl = computed(() =>
    this.cursor() ? this.history.previous(this.currentUrl()) : undefined,
  );
  readonly directory = injectQuery(() => ({
    queryKey: [
      'staff',
      this.staffSession.operator()?.userId,
      this.staffSession.operator()?.role,
      this.resource,
      this.query().data,
    ],
    enabled: this.query().success,
    meta: { handleErrorsLocally: true },
    queryFn: () => this.load(),
  }));
  readonly users = computed(() => {
    const data = this.directory.data();
    return data && 'users' in data ? data.users : [];
  });
  readonly workspaces = computed(() => {
    const data = this.directory.data();
    return data && 'workspaces' in data ? data.workspaces : [];
  });
  readonly billingAccounts = computed(() => {
    const data = this.directory.data();
    return data && 'billingAccounts' in data ? data.billingAccounts : [];
  });
  readonly titleKey = directoryKeys[this.resource].title;
  readonly descriptionKey = directoryKeys[this.resource].description;
  readonly emptyKey = directoryKeys[this.resource].empty;
  readonly formatDate = formatStaffDate;
  readonly formatBytes = formatStaffBytes;

  async applySearch(): Promise<void> {
    const search = this.searchDraft().trim();
    this.searchError.set(search.length > 0 && (search.length < 2 || search.length > 100));
    if (this.searchError()) return;
    await this.navigate({ ...this.currentQuery(), q: search || undefined, cursor: undefined });
  }

  async clearSearch(): Promise<void> {
    this.searchDraft.set('');
    await this.applySearch();
  }

  async changeWorkspaceState(value: unknown): Promise<void> {
    if (value !== 'all' && value !== 'current' && value !== 'deleted') return;
    await this.navigate({ ...this.currentQuery(), state: value, cursor: undefined });
  }

  async nextPage(): Promise<void> {
    const cursor = this.directory.data()?.nextCursor;
    if (!cursor) return;
    const url = staffDirectoryUrl(this.resource, { ...this.currentQuery(), cursor });
    this.history.rememberNext(this.currentUrl(), url);
    await this.router.navigateByUrl(url);
  }

  async previousPage(): Promise<void> {
    const url = this.previousUrl();
    if (url) await this.router.navigateByUrl(url);
  }

  async firstPage(): Promise<void> {
    await this.navigate({ ...this.currentQuery(), cursor: undefined });
  }

  async resetFilters(): Promise<void> {
    this.searchError.set(false);
    await this.navigate({ limit: 25, state: 'all' });
  }

  errorKey(): string {
    const error = this.directory.error();
    if (error instanceof HttpErrorResponse && error.status === 0) return 'staff.workspace.offline';
    return apiErrorTranslationKey(error);
  }

  private load(): Promise<DirectoryResponse> {
    const query = this.currentQuery();
    if (this.resource === 'users') return this.staffApi.users(query);
    if (this.resource === 'workspaces') return this.staffApi.workspaces(query);
    return this.staffApi.billingAccounts(query);
  }
  private currentQuery(): StaffWorkspaceListQuery {
    return this.query().data ?? { limit: 25, state: 'all' };
  }

  private navigate(query: StaffWorkspaceListQuery): Promise<boolean> {
    return this.router.navigateByUrl(staffDirectoryUrl(this.resource, query));
  }
}

function readResource(value: unknown): DirectoryResource {
  if (value === 'users' || value === 'workspaces' || value === 'billingAccounts') return value;
  return 'users';
}

const directoryKeys = {
  users: {
    title: 'staff.directory.users.title',
    description: 'staff.directory.users.description',
    empty: 'staff.directory.users.empty',
  },
  workspaces: {
    title: 'staff.directory.workspaces.title',
    description: 'staff.directory.workspaces.description',
    empty: 'staff.directory.workspaces.empty',
  },
  billingAccounts: {
    title: 'staff.directory.billingAccounts.title',
    description: 'staff.directory.billingAccounts.description',
    empty: 'staff.directory.billingAccounts.empty',
  },
} as const;
