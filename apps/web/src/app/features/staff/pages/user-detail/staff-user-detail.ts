import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState, StatusBadge } from '../../../../shared/ui/public-api';
import { injectStaffDirectoryReturn } from '../../state/staff-directory-return';
import { StaffApi } from '../../data-access/staff-api';
import { formatStaffDate, staffWorkspaceRoleTranslationKey } from '../../domain/staff-format';
import { StaffSession } from '../../state/staff-session';

@Component({
  selector: 'app-staff-user-detail',
  imports: [RouterLink, TranslocoPipe, Button, PageState, StatusBadge],
  templateUrl: './staff-user-detail.html',
  styleUrl: './staff-user-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffUserDetail {
  readonly directoryReturn = injectStaffDirectoryReturn('/staff/users');
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StaffApi);
  private readonly staffSession = inject(StaffSession);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly userId = computed(() => this.params().get('userId') ?? '');
  readonly pagination = linkedSignal<{
    cursor: string | undefined;
    history: Array<string | undefined>;
  }>(() => {
    this.userId();
    return { cursor: undefined, history: [] };
  });
  readonly detail = injectQuery(() => ({
    queryKey: [
      'staff',
      this.staffSession.operator()?.userId,
      this.staffSession.operator()?.role,
      'user',
      this.userId(),
      this.pagination().cursor,
    ],
    meta: { handleErrorsLocally: true },
    queryFn: () =>
      this.api.userDetail(this.userId(), { cursor: this.pagination().cursor, limit: 25 }),
  }));
  readonly formatDate = formatStaffDate;
  readonly roleKey = staffWorkspaceRoleTranslationKey;
  readonly errorKey = computed(() => {
    const error = this.detail.error();
    if (apiErrorCode(error) === 'not_found') return 'staff.user.notFound';
    if (error instanceof HttpErrorResponse && error.status === 0) return 'staff.workspace.offline';
    return apiErrorTranslationKey(error);
  });

  nextPage(): void {
    const cursor = this.detail.data()?.nextCursor;
    if (!cursor) return;
    this.pagination.update((page) => ({ cursor, history: [...page.history, page.cursor] }));
  }

  previousPage(): void {
    if (this.pagination().history.length === 0) return;
    this.pagination.update((page) => {
      const history = [...page.history];
      return { cursor: history.pop(), history };
    });
  }
}
