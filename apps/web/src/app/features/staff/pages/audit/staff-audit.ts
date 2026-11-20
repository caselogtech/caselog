import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { staffAuditLogListQuerySchema, type StaffAuditLogListQuery } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState } from '../../../../shared/ui/public-api';
import { StaffApi } from '../../data-access/staff-api';
import {
  staffAuditDraft,
  staffAuditDraftRequest,
  staffAuditUrl,
  type StaffAuditDraft,
} from '../../domain/staff-audit-navigation';
import { formatStaffAuditDate } from '../../domain/staff-format';
import { StaffListHistory } from '../../state/staff-list-history';
import { StaffSession } from '../../state/staff-session';

@Component({
  selector: 'app-staff-audit',
  imports: [Button, FormsModule, PageState, TranslocoPipe],
  templateUrl: './staff-audit.html',
  styleUrl: './staff-audit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffAudit {
  private readonly staffApi = inject(StaffApi);
  private readonly session = inject(StaffSession);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly history = inject(StaffListHistory);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly query = computed(() =>
    staffAuditLogListQuerySchema.safeParse({
      cursor: this.params().get('cursor') ?? undefined,
      limit: this.params().get('limit') ?? undefined,
      q: this.params().get('q') ?? undefined,
      action: this.params().get('action') ?? undefined,
      targetType: this.params().get('targetType') ?? undefined,
      targetId: this.params().get('targetId') ?? undefined,
      from: this.params().get('from') ?? undefined,
      to: this.params().get('to') ?? undefined,
    }),
  );
  readonly draft = linkedSignal(() => staffAuditDraft(this.query().data));
  readonly validationError = linkedSignal({ source: this.params, computation: () => false });
  readonly currentUrl = computed(() => staffAuditUrl(this.currentQuery()));
  readonly previousUrl = computed(() =>
    this.query().data?.cursor ? this.history.previous(this.currentUrl()) : undefined,
  );
  readonly audit = injectQuery(() => ({
    queryKey: [
      'staff',
      this.session.operator()?.userId,
      this.session.operator()?.role,
      'audit',
      this.query().data,
    ],
    enabled: this.query().success,
    meta: { handleErrorsLocally: true },
    queryFn: () => this.staffApi.auditLogs(this.currentQuery()),
  }));
  readonly formatDate = formatStaffAuditDate;

  updateFilter(field: keyof StaffAuditDraft, value: unknown): void {
    if (typeof value === 'string') this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  async applyFilters(): Promise<void> {
    const parsed = staffAuditLogListQuerySchema.safeParse(
      staffAuditDraftRequest(this.draft(), this.currentQuery().limit),
    );
    this.validationError.set(!parsed.success);
    if (parsed.success) await this.router.navigateByUrl(staffAuditUrl(parsed.data));
  }

  async clearFilters(): Promise<void> {
    this.validationError.set(false);
    await this.router.navigateByUrl('/staff/audit');
  }

  async firstPage(): Promise<void> {
    await this.router.navigateByUrl(staffAuditUrl({ ...this.currentQuery(), cursor: undefined }));
  }

  async nextPage(): Promise<void> {
    const cursor = this.audit.data()?.nextCursor;
    if (!cursor) return;
    const url = staffAuditUrl({ ...this.currentQuery(), cursor });
    this.history.rememberNext(this.currentUrl(), url);
    await this.router.navigateByUrl(url);
  }

  async previousPage(): Promise<void> {
    const url = this.previousUrl();
    if (url) await this.router.navigateByUrl(url);
  }

  errorKey(): string {
    const error = this.audit.error();
    if (error instanceof HttpErrorResponse && error.status === 0) return 'staff.workspace.offline';
    return apiErrorTranslationKey(error);
  }

  private currentQuery(): StaffAuditLogListQuery {
    return this.query().data ?? { limit: 25 };
  }
}
