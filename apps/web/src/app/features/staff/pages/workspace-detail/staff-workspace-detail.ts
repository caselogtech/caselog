import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState, StatusBadge } from '../../../../shared/ui/public-api';
import { injectStaffDirectoryReturn } from '../../state/staff-directory-return';
import { StaffApi } from '../../data-access/staff-api';
import { StaffSession } from '../../state/staff-session';
import { formatStaffBytes, formatStaffDate } from '../../domain/staff-format';

@Component({
  selector: 'app-staff-workspace-detail',
  imports: [RouterLink, TranslocoPipe, Button, PageState, StatusBadge],
  templateUrl: './staff-workspace-detail.html',
  styleUrl: './staff-workspace-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffWorkspaceDetail {
  readonly directoryReturn = injectStaffDirectoryReturn('/staff/workspaces');
  private readonly route = inject(ActivatedRoute);
  private readonly staffSession = inject(StaffSession);
  private readonly api = inject(StaffApi);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly workspaceId = computed(() => this.params().get('workspaceId') ?? '');
  readonly detail = injectQuery(() => ({
    queryKey: [
      'staff',
      this.staffSession.operator()?.userId,
      this.staffSession.operator()?.role,
      'workspace',
      this.workspaceId(),
    ],
    meta: { handleErrorsLocally: true },
    queryFn: () => this.api.workspaceDetail(this.workspaceId()),
  }));
  readonly formatDate = formatStaffDate;
  readonly formatBytes = formatStaffBytes;
  readonly errorKey = computed(() => {
    const error = this.detail.error();
    if (apiErrorCode(error) === 'not_found') return 'staff.workspace.notFound';
    if (error instanceof HttpErrorResponse && error.status === 0) return 'staff.workspace.offline';
    return apiErrorTranslationKey(error);
  });
  readonly metrics = computed(() => {
    const data = this.detail.data();
    if (!data) return [];
    return [
      { key: 'staff.columns.members', value: data.workspace.memberCount },
      { key: 'staff.columns.projects', value: data.workspace.projectCount },
      { key: 'staff.workspace.testCases', value: data.usage.testCases },
      { key: 'staff.workspace.testRuns', value: data.usage.testRuns },
      { key: 'staff.workspace.openTestRuns', value: data.usage.openTestRuns },
      { key: 'staff.workspace.ingestions', value: data.usage.ingestions },
    ];
  });
}
