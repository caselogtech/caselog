import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import {
  type AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { EvidenceMetricKey, EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import type { EvidenceExplorerFilters } from '../../domain/evidence-explorer';
import { metricLabel } from '../../domain/readiness-presentation';

type Trust = EvidenceObservation['producer']['trust'];
type Freshness = EvidenceObservation['freshness'];
type ObservationState = EvidenceObservation['state'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validDateRange: ValidatorFn = (control: AbstractControl) => {
  const after = String(control.get('observedAfter')?.value ?? '');
  const before = String(control.get('observedBefore')?.value ?? '');
  return after && before && after > before ? { invalidDateRange: true } : null;
};

const TRUST_LABEL: Record<Trust, string> = {
  verified: 'readiness.evidence.trust.verified',
  authenticated: 'readiness.evidence.trust.authenticated',
  unverified: 'readiness.evidence.trust.unverified',
};

const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'readiness.evidence.freshness.current',
  stale: 'readiness.evidence.freshness.stale',
};

const STATE_LABEL: Record<ObservationState, string> = {
  available: 'readiness.evidence.explorer.states.available',
  incomplete: 'readiness.evidence.explorer.states.incomplete',
};

@Component({
  selector: 'app-evidence-filters',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './evidence-filters.html',
  styleUrl: './evidence-filters.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceFilters {
  readonly value = input.required<EvidenceExplorerFilters>();
  readonly filtersApplied = output<EvidenceExplorerFilters>();

  readonly metrics: EvidenceMetricKey[] = [
    'test.pass_rate',
    'test.completion_rate',
    'test.failed_count',
  ];
  readonly trustLevels: Trust[] = ['verified', 'authenticated', 'unverified'];
  readonly freshnessValues: Freshness[] = ['current', 'stale'];
  readonly states: ObservationState[] = ['available', 'incomplete'];

  readonly form = new FormGroup(
    {
      candidateId: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(UUID_PATTERN)],
      }),
      metricKey: new FormControl<EvidenceMetricKey | ''>('', { nonNullable: true }),
      producerKey: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(120)],
      }),
      sourceType: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(80)],
      }),
      trust: new FormControl<Trust | ''>('', { nonNullable: true }),
      freshness: new FormControl<Freshness | ''>('', { nonNullable: true }),
      state: new FormControl<ObservationState | ''>('', { nonNullable: true }),
      currentOnly: new FormControl<'true' | 'false'>('true', { nonNullable: true }),
      observedAfter: new FormControl('', { nonNullable: true }),
      observedBefore: new FormControl('', { nonNullable: true }),
    },
    { validators: [validDateRange] },
  );

  constructor() {
    effect(() => {
      const value = this.value();
      this.form.setValue(
        {
          ...value,
          currentOnly: value.currentOnly ? 'true' : 'false',
        },
        { emitEvent: false },
      );
      this.form.markAsPristine();
    });
  }

  apply(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.filtersApplied.emit({
      ...value,
      candidateId: value.candidateId.trim(),
      producerKey: value.producerKey.trim(),
      sourceType: value.sourceType.trim(),
      currentOnly: value.currentOnly === 'true',
    });
  }

  reset(): void {
    const candidateId = this.form.controls.candidateId.value.trim();
    this.filtersApplied.emit({
      candidateId,
      metricKey: '',
      producerKey: '',
      sourceType: '',
      trust: '',
      freshness: '',
      state: '',
      currentOnly: true,
      observedAfter: '',
      observedBefore: '',
    });
  }

  metric(metric: EvidenceMetricKey): string {
    return metricLabel(metric);
  }

  trustLabel(trust: Trust): string {
    return TRUST_LABEL[trust];
  }

  freshnessLabel(freshness: Freshness): string {
    return FRESHNESS_LABEL[freshness];
  }

  stateLabel(state: ObservationState): string {
    return STATE_LABEL[state];
  }
}
