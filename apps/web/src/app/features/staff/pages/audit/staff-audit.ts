import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState } from '../../../../shared/ui/public-api';
import { StaffApi } from '../../data-access/staff-api';
import { formatStaffDate } from '../../domain/staff-format';

@Component({
  selector: 'app-staff-audit',
  imports: [Button, PageState, TranslocoPipe],
  templateUrl: './staff-audit.html',
  styleUrl: './staff-audit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffAudit {
  private readonly staffApi = inject(StaffApi);
  readonly audit = injectQuery(() => ({
    queryKey: ['staff', 'audit'],
    queryFn: () => this.staffApi.auditLogs({ limit: 100 }),
  }));
  readonly formatDate = formatStaffDate;

  errorKey(): string {
    return apiErrorTranslationKey(this.audit.error());
  }
}
