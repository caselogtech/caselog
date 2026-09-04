import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, PageState, StatusBadge } from '../../../../shared/ui/public-api';
import { StaffApi } from '../../data-access/staff-api';
import {
  formatStaffDate,
  staffOperatorStateTranslationKey,
  staffRoleTranslationKey,
} from '../../domain/staff-format';

@Component({
  selector: 'app-staff-operators',
  imports: [Button, FormsModule, PageState, StatusBadge, TranslocoPipe],
  templateUrl: './staff-operators.html',
  styleUrl: './staff-operators.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffOperators {
  private readonly staffApi = inject(StaffApi);
  private readonly queryClient = inject(QueryClient);
  readonly email = signal('');
  readonly role = signal<'owner' | 'admin' | 'support'>('admin');
  readonly accessExpiresAt = signal(defaultExpiry());
  readonly grantReason = signal('');
  readonly revokeReason = signal('');
  readonly operators = injectQuery(() => ({
    queryKey: ['staff', 'operators'],
    queryFn: () => this.staffApi.operators({ limit: 100 }),
  }));
  readonly grant = injectMutation(() => ({
    mutationFn: () =>
      this.staffApi.grantOperator({
        email: this.email().trim(),
        role: this.role(),
        accessExpiresAt: new Date(this.accessExpiresAt()).toISOString(),
        reason: this.grantReason().trim(),
      }),
    onSuccess: () => {
      this.email.set('');
      this.grantReason.set('');
      void this.queryClient.invalidateQueries({ queryKey: ['staff', 'operators'] });
    },
  }));
  readonly revoke = injectMutation(() => ({
    mutationFn: (userId: string) =>
      this.staffApi.revokeOperator(userId, { reason: this.revokeReason().trim() }),
    onSuccess: () => {
      this.revokeReason.set('');
      void this.queryClient.invalidateQueries({ queryKey: ['staff', 'operators'] });
    },
  }));
  readonly formatDate = formatStaffDate;
  readonly roleKey = staffRoleTranslationKey;
  readonly stateKey = staffOperatorStateTranslationKey;

  submitGrant(): void {
    if (!this.email().trim() || this.grantReason().trim().length < 10 || !this.accessExpiresAt()) {
      return;
    }
    this.grant.mutate();
  }

  revokeOperator(userId: string): void {
    if (this.revokeReason().trim().length < 10) return;
    this.revoke.mutate(userId);
  }

  state(operator: {
    disabledAt: string | null;
    accessExpiresAt: string;
  }): 'active' | 'disabled' | 'expired' {
    if (operator.disabledAt) return 'disabled';
    return Date.parse(operator.accessExpiresAt) <= Date.now() ? 'expired' : 'active';
  }

  tone(state: 'active' | 'disabled' | 'expired'): 'success' | 'neutral' | 'warning' {
    if (state === 'active') return 'success';
    return state === 'expired' ? 'warning' : 'neutral';
  }

  listErrorKey(): string {
    return apiErrorTranslationKey(this.operators.error());
  }

  mutationErrorKey(): string {
    return apiErrorTranslationKey(this.grant.error() ?? this.revoke.error());
  }
}

function defaultExpiry(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
