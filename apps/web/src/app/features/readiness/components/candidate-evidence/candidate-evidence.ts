import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../../shared/ui/public-api';
import {
  evidenceFreshnessPresentation,
  evidenceTrustPresentation,
  metricLabel,
} from '../../domain/readiness-presentation';

@Component({
  selector: 'app-candidate-evidence',
  imports: [DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './candidate-evidence.html',
  styleUrl: './candidate-evidence.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidateEvidence {
  readonly observations = input.required<readonly EvidenceObservation[]>();

  metric(observation: EvidenceObservation): string {
    return metricLabel(observation.metricKey);
  }

  value(observation: EvidenceObservation): string {
    const value = observation.value.value;
    if (value === null) return '—';
    return observation.value.type === 'percentage' ? `${value}%` : String(value);
  }

  trust(observation: EvidenceObservation) {
    return evidenceTrustPresentation(observation.producer.trust);
  }

  freshness(observation: EvidenceObservation) {
    return evidenceFreshnessPresentation(observation.freshness);
  }

  revisionStatus(observation: EvidenceObservation) {
    return observation.isCurrent
      ? ({ labelKey: 'readiness.evidence.revision.current', tone: 'success' } as const)
      : ({ labelKey: 'readiness.evidence.revision.superseded', tone: 'neutral' } as const);
  }
}
