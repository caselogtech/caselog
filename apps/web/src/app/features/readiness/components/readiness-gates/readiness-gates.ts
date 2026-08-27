import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { GateEvaluation } from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../../shared/ui/public-api';
import {
  evidenceFreshnessPresentation,
  evidenceTrustPresentation,
  diagnosticLabel,
  explanationLabel,
  formatReadinessValue,
  gateImpactPresentation,
  gateResultPresentation,
  metricLabel,
  operatorSymbol,
  type ReadinessGateRow,
} from '../../domain/readiness-presentation';

@Component({
  selector: 'app-readiness-gates',
  imports: [DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './readiness-gates.html',
  styleUrl: './readiness-gates.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessGates {
  readonly rows = input.required<readonly ReadinessGateRow[]>();

  result(row: ReadinessGateRow) {
    return gateResultPresentation(row.evaluation.result);
  }

  impact(row: ReadinessGateRow) {
    return gateImpactPresentation(row.impact);
  }

  metric(row: ReadinessGateRow): string {
    return metricLabel(row.evaluation.metricKey);
  }

  explanation(row: ReadinessGateRow): string {
    return explanationLabel(row.evaluation.explanationCode);
  }

  diagnostic(row: ReadinessGateRow): string {
    return diagnosticLabel(row.evaluation.diagnostic);
  }

  operator(row: ReadinessGateRow): string {
    return operatorSymbol(row.evaluation.operator);
  }

  value(value: GateEvaluation['actual']): string {
    return formatReadinessValue(value);
  }

  trust(observation: EvidenceObservation) {
    return evidenceTrustPresentation(observation.producer.trust);
  }

  freshness(observation: EvidenceObservation) {
    return evidenceFreshnessPresentation(observation.freshness);
  }
}
