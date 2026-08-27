import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReadinessPolicySummary } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-policy-catalog',
  imports: [Button, DatePipe, RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './policy-catalog.html',
  styleUrl: './policy-catalog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyCatalog {
  readonly policies = input.required<ReadonlyArray<ReadinessPolicySummary>>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly hasNextPage = input(false);
  readonly fetchingNextPage = input(false);

  readonly loadMore = output<void>();
}
