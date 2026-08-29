import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { EnvironmentSettingsSummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge, type ButtonVariant } from '../../../../shared/ui/public-api';
import type { EnvironmentLifecycleAction } from '../../data-access/project-environments-api';
import { environmentPresentation } from '../../domain/environment-presentation';

export type EnvironmentStateChangeRequest = {
  action: EnvironmentLifecycleAction;
  environment: EnvironmentSettingsSummary;
};

@Component({
  selector: 'app-environment-list',
  imports: [Button, DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './environment-list.html',
  styleUrl: './environment-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentList {
  readonly environments = input.required<readonly EnvironmentSettingsSummary[]>();
  readonly canManage = input(false);
  readonly pending = input(false);
  readonly editRequested = output<EnvironmentSettingsSummary>();
  readonly stateChangeRequested = output<EnvironmentStateChangeRequest>();

  presentation(environment: EnvironmentSettingsSummary) {
    return environmentPresentation(environment.state);
  }

  actionVariant(environment: EnvironmentSettingsSummary): ButtonVariant {
    return environment.state === 'active' ? 'danger' : 'secondary';
  }

  requestEdit(environment: EnvironmentSettingsSummary): void {
    if (this.canManage() && !this.pending()) this.editRequested.emit(environment);
  }

  requestStateChange(environment: EnvironmentSettingsSummary): void {
    if (!this.canManage() || this.pending()) return;
    const { action } = this.presentation(environment);
    this.stateChangeRequested.emit({ action, environment });
  }
}
