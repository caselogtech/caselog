import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState } from '../../../../shared/ui/public-api';
import { StaffApi } from '../../data-access/staff-api';
import { formatStaffBytes } from '../../domain/staff-format';

@Component({
  selector: 'app-staff-overview',
  imports: [Button, PageState, TranslocoPipe],
  templateUrl: './staff-overview.html',
  styleUrl: './staff-overview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffOverview {
  private readonly staffApi = inject(StaffApi);
  readonly overview = injectQuery(() => ({
    queryKey: ['staff', 'overview'],
    queryFn: () => this.staffApi.overview(),
  }));
  readonly formatBytes = formatStaffBytes;

  errorKey(): string {
    return apiErrorTranslationKey(this.overview.error());
  }
}
