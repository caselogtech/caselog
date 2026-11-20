import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { StaffSession } from '../../state/staff-session';
import { formatStaffBytes, formatStaffDate } from '../../domain/staff-format';

type DirectoryResource = 'users' | 'workspaces' | 'billingAccounts';
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
  private readonly staffSession = inject(StaffSession);
  private readonly staffApi = inject(StaffApi);
  // biome-ignore lint/complexity/useLiteralKeys: Angular route data is an index-signature contract.
  readonly resource = readResource(this.route.snapshot.data['resource']);
  readonly cursor = signal<string | null>(null);
  readonly cursorHistory = signal<string[]>([]);
  readonly searchDraft = signal('');
  readonly search = signal('');
  readonly searchError = signal(false);
  readonly workspaceState = signal<StaffWorkspaceListQuery['state']>('all');
  readonly directory = injectQuery(() => ({
    queryKey: [
      'staff',
      this.staffSession.operator()?.userId,
      this.staffSession.operator()?.role,
      this.resource,
      this.cursor(),
      this.search(),
      this.workspaceState(),
    ],
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

  applySearch(): void {
    const search = this.searchDraft().trim();
    this.searchError.set(search.length > 0 && (search.length < 2 || search.length > 100));
    if (this.searchError()) return;
    this.cursor.set(null);
    this.cursorHistory.set([]);
    this.search.set(search);
  }

  clearSearch(): void {
    this.searchDraft.set('');
    this.applySearch();
  }

  changeWorkspaceState(value: unknown): void {
    if (value !== 'all' && value !== 'current' && value !== 'deleted') return;
    this.cursor.set(null);
    this.cursorHistory.set([]);
    this.workspaceState.set(value);
  }

  nextPage(): void {
    const nextCursor = this.directory.data()?.nextCursor;
    if (!nextCursor) return;
    const current = this.cursor();
    this.cursorHistory.update((history) => [...history, current ?? '']);
    this.cursor.set(nextCursor);
  }

  previousPage(): void {
    const history = [...this.cursorHistory()];
    const previous = history.pop();
    this.cursorHistory.set(history);
    this.cursor.set(previous || null);
  }

  errorKey(): string {
    return apiErrorTranslationKey(this.directory.error());
  }

  private load(): Promise<DirectoryResponse> {
    const query = {
      cursor: this.cursor() ?? undefined,
      limit: 25,
      q: this.search() || undefined,
    };
    if (this.resource === 'users') return this.staffApi.users(query);
    if (this.resource === 'workspaces')
      return this.staffApi.workspaces({ ...query, state: this.workspaceState() });
    return this.staffApi.billingAccounts(query);
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
