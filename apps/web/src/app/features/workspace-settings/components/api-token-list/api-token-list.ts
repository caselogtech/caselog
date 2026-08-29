import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ApiTokenScope, ApiTokenSummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge } from '../../../../shared/ui/public-api';
import { apiTokenExpired, apiTokenScopeLabelKey } from '../../domain/api-token-presentation';

@Component({
  selector: 'app-api-token-list',
  imports: [Button, DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './api-token-list.html',
  styleUrl: './api-token-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiTokenList {
  readonly tokens = input.required<ApiTokenSummary[]>();
  readonly pending = input(false);
  readonly revokeRequested = output<ApiTokenSummary>();
  readonly scopeLabelKey = apiTokenScopeLabelKey;
  readonly expired = apiTokenExpired;

  trackScope(_index: number, scope: ApiTokenScope): ApiTokenScope {
    return scope;
  }
}
