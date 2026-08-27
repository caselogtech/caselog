import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  CreateReadinessWaiverRequest,
  ReadinessDecision,
  ReadinessWaiver,
  ReadinessWaiverScope,
  RevokeReadinessWaiverRequest,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField, StatusBadge } from '../../../../shared/ui/public-api';
import {
  gateResultPresentation,
  readinessWaiverStatusPresentation,
} from '../../domain/readiness-presentation';

export type RevokeWaiverRequest = {
  waiverId: string;
  request: RevokeReadinessWaiverRequest;
};

@Component({
  selector: 'app-waiver-manager',
  imports: [
    Button,
    DatePipe,
    FormControlStyle,
    FormField,
    ReactiveFormsModule,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './waiver-manager.html',
  styleUrl: './waiver-manager.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaiverManager {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly decision = input.required<ReadinessDecision>();
  readonly waivers = input.required<readonly ReadinessWaiver[]>();
  readonly canManage = input(false);
  readonly creating = input(false);
  readonly revoking = input(false);
  readonly createRequested = output<CreateReadinessWaiverRequest>();
  readonly revokeRequested = output<RevokeWaiverRequest>();
  readonly revokingWaiverId = signal<string | null>(null);

  readonly createForm = this.formBuilder.group({
    scopeType: this.formBuilder.control<ReadinessWaiverScope['type']>('decision'),
    gateEvaluationId: '',
    reason: ['', [Validators.required, Validators.maxLength(2_000)]],
    expiresAt: '',
    externalApprovalReference: ['', Validators.maxLength(500)],
  });
  readonly revokeForm = this.formBuilder.group({
    reason: ['', [Validators.required, Validators.maxLength(1_000)]],
  });

  readonly activeWaivers = computed(() =>
    this.waivers().filter(({ status }) => status === 'active'),
  );
  readonly activeDecisionWaiver = computed(() =>
    this.activeWaivers().some(({ scope }) => scope.type === 'decision'),
  );
  readonly activeGateIds = computed(
    () =>
      new Set(
        this.activeWaivers().flatMap(({ scope }) =>
          scope.type === 'gate_evaluation' ? [scope.gateEvaluationId] : [],
        ),
      ),
  );
  readonly eligibleGates = computed(() =>
    this.decision().gates.filter(
      ({ id, result }) => result !== 'passed' && !this.activeGateIds().has(id),
    ),
  );
  readonly canCreate = computed(
    () => this.canManage() && this.decision().status !== 'ready' && !this.activeDecisionWaiver(),
  );

  status(status: ReadinessWaiver['status']) {
    return readinessWaiverStatusPresentation(status);
  }

  gateResult(gate: ReadinessDecision['gates'][number]) {
    return gateResultPresentation(gate.result);
  }

  gateLabel(gateEvaluationId: string): string {
    return (
      this.decision().gates.find(({ id }) => id === gateEvaluationId)?.gateKey ?? gateEvaluationId
    );
  }

  scopeLabel(scope: ReadinessWaiverScope): string {
    return scope.type === 'decision'
      ? 'readiness.waivers.scopeDecision'
      : 'readiness.waivers.scopeGate';
  }

  requestCreate(): void {
    if (!this.canCreate() || this.creating() || this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const value = this.createForm.getRawValue();
    const reason = value.reason.trim();
    if (!reason) {
      this.createForm.controls.reason.setErrors({ required: true });
      this.createForm.controls.reason.markAsTouched();
      return;
    }
    const scope = this.scope(value.scopeType, value.gateEvaluationId);
    if (!scope) {
      this.createForm.controls.gateEvaluationId.setErrors({ required: true });
      this.createForm.controls.gateEvaluationId.markAsTouched();
      return;
    }
    const expiresAt = this.expiry(value.expiresAt);
    if (expiresAt === undefined) {
      this.createForm.controls.expiresAt.setErrors({ future: true });
      this.createForm.controls.expiresAt.markAsTouched();
      return;
    }
    this.createRequested.emit({
      scope,
      reason,
      expiresAt,
      externalApprovalReference: value.externalApprovalReference.trim() || null,
    });
  }

  startRevocation(waiverId: string): void {
    this.revokeForm.reset({ reason: '' });
    this.revokingWaiverId.set(waiverId);
  }

  cancelRevocation(): void {
    if (!this.revoking()) this.revokingWaiverId.set(null);
  }

  requestRevocation(): void {
    const waiverId = this.revokingWaiverId();
    if (!waiverId || !this.canManage() || this.revoking() || this.revokeForm.invalid) {
      this.revokeForm.markAllAsTouched();
      return;
    }
    const reason = this.revokeForm.getRawValue().reason.trim();
    if (!reason) {
      this.revokeForm.controls.reason.setErrors({ required: true });
      this.revokeForm.controls.reason.markAsTouched();
      return;
    }
    this.revokeRequested.emit({
      waiverId,
      request: { reason },
    });
  }

  completeCreate(): void {
    this.createForm.reset({
      scopeType: this.activeDecisionWaiver() ? 'gate_evaluation' : 'decision',
      gateEvaluationId: '',
      reason: '',
      expiresAt: '',
      externalApprovalReference: '',
    });
  }

  completeRevocation(): void {
    this.revokeForm.reset({ reason: '' });
    this.revokingWaiverId.set(null);
  }

  private scope(
    scopeType: ReadinessWaiverScope['type'],
    gateEvaluationId: string,
  ): ReadinessWaiverScope | null {
    if (scopeType === 'decision') {
      return this.activeDecisionWaiver() ? null : { type: 'decision' };
    }
    return this.eligibleGates().some(({ id }) => id === gateEvaluationId)
      ? { type: 'gate_evaluation', gateEvaluationId }
      : null;
  }

  private expiry(value: string): string | null | undefined {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > Date.now()
      ? new Date(timestamp).toISOString()
      : undefined;
  }
}
