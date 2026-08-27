import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { EnvironmentSummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge, type ButtonVariant } from '../../../../shared/ui/public-api';
import type { EnvironmentLifecycleAction } from '../../data-access/project-environments-api';
import { environmentPresentation } from '../../domain/environment-presentation';

export type EnvironmentStateChangeRequest = {
  action: EnvironmentLifecycleAction;
  environment: EnvironmentSummary;
};

@Component({
  selector: 'app-environment-list',
  imports: [Button, DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './environment-list.html',
  styleUrl: './environment-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentList {
  readonly environments = input.required<readonly EnvironmentSummary[]>();
  readonly canManage = input(false);
  readonly pending = input(false);
  readonly stateChangeRequested = output<EnvironmentStateChangeRequest>();

  presentation(environment: EnvironmentSummary) {
    return environmentPresentation(environment.state);
  }

  actionVariant(environment: EnvironmentSummary): ButtonVariant {
    return environment.state === 'active' ? 'danger' : 'secondary';
  }

  requestStateChange(environment: EnvironmentSummary): void {
    if (!this.canManage() || this.pending()) return;
    const { action } = this.presentation(environment);
    this.stateChangeRequested.emit({ action, environment });
  }
}
