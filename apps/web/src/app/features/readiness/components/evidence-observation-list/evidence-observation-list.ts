import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import { Disclosure, StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';
import { evidenceDiagnostic } from '../../domain/evidence-explorer';
import {
  evidenceFreshnessPresentation,
  evidenceTrustPresentation,
  metricLabel,
} from '../../domain/readiness-presentation';

const ROLE_LABEL: Record<EvidenceObservation['dimensions']['testRunRole'], string> = {
  required: 'readiness.gates.roles.required',
  informational: 'readiness.gates.roles.informational',
};

const STATE_LABEL: Record<EvidenceObservation['state'], string> = {
  available: 'readiness.evidence.explorer.states.available',
  incomplete: 'readiness.evidence.explorer.states.incomplete',
};

@Component({
  selector: 'app-evidence-observation-list',
  imports: [DatePipe, Disclosure, JsonPipe, StatusBadge, TranslocoPipe],
  templateUrl: './evidence-observation-list.html',
  styleUrl: './evidence-observation-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceObservationList {
  readonly observations = input.required<readonly EvidenceObservation[]>();

  metric(observation: EvidenceObservation): string {
    return metricLabel(observation.metricKey);
  }

  value(observation: EvidenceObservation): string {
    const value = observation.value.value;
    if (value === null) return '—';
    return observation.value.type === 'percentage' ? `${value}%` : String(value);
  }

  diagnostic(observation: EvidenceObservation) {
    return evidenceDiagnostic(observation);
  }

  stateLabel(state: EvidenceObservation['state']): string {
    return STATE_LABEL[state];
  }

  stateTone(state: EvidenceObservation['state']): StatusBadgeTone {
    return state === 'available' ? 'success' : 'warning';
  }

  roleLabel(role: EvidenceObservation['dimensions']['testRunRole']): string {
    return ROLE_LABEL[role];
  }

  trust(observation: EvidenceObservation) {
    return evidenceTrustPresentation(observation.producer.trust);
  }

  freshness(observation: EvidenceObservation) {
    return evidenceFreshnessPresentation(observation.freshness);
  }

  revisionLabel(observation: EvidenceObservation): string {
    return observation.isCurrent
      ? 'readiness.evidence.revision.current'
      : 'readiness.evidence.revision.superseded';
  }

  revisionTone(observation: EvidenceObservation): StatusBadgeTone {
    return observation.isCurrent ? 'success' : 'neutral';
  }
}
