import type { GateFormCriterionResult } from '@caselog/schemas';
import { priorityLabel } from '../../domain/readiness-presentation';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { GateEvaluation } from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
  private readonly i18n = inject(TranslocoService);
  criterionLabel(label: string): string {
    const keys: Record<string, string> = {
      'test.pass_rate': 'readiness.metrics.passRate',
      'test.completion_rate': 'readiness.metrics.completionRate',
      'test.failed_count': 'readiness.metrics.failedCount',
    };
    return keys[label] ? this.i18n.translate(keys[label]) : label;
  }
  criterionResult(result: GateFormCriterionResult['result']): string {
    return gateResultPresentation(result).labelKey;
  }
  criterionDiagnostic(diagnostic: GateFormCriterionResult['diagnostic']): string {
    return diagnosticLabel(diagnostic);
  }
  criterionValue(value: string | null): string {
    const keys: Record<string, string> = {
      Complete: 'readiness.forms.complete',
      Incomplete: 'readiness.forms.incomplete',
      Checked: 'readiness.forms.checked',
      'Required fields completed': 'readiness.forms.requiredCompleted',
      true: 'readiness.forms.yes',
      false: 'readiness.forms.no',
    };
    if (value === null) return '—';
    if (keys[value]) return this.i18n.translate(keys[value]);
    const comparison = /^(eq|ne|gt|gte|lt|lte) (-?[0-9.]+)$/.exec(value);
    const symbols: Record<string, string> = {
      eq: '=',
      ne: '≠',
      gt: '>',
      gte: '≥',
      lt: '<',
      lte: '≤',
    };
    return comparison?.[1] ? `${symbols[comparison[1]]} ${comparison[2]}` : value;
  }
  readonly priorityLabel = priorityLabel;
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

  value(value: GateEvaluation['actual'], metricKey?: GateEvaluation['metricKey']): string {
    return formatReadinessValue(value, metricKey);
  }

  trust(observation: EvidenceObservation) {
    return evidenceTrustPresentation(observation.producer.trust);
  }

  freshness(observation: EvidenceObservation) {
    return evidenceFreshnessPresentation(observation.freshness);
  }
}
