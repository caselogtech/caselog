import { gateCriterionDescription } from '../../domain/gate-form-presentation';
import type { GateFormDefinition, GateFormCriterion } from '@caselog/schemas';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { ReadinessPolicy } from '@caselog/schemas/readiness';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';
import { priorityLabel } from '../../domain/readiness-presentation';

type ReadinessPolicyVersion = ReadinessPolicy['versions'][number];
type ReadinessGate = ReadinessPolicyVersion['gates'][number];
type ReadinessMetricKey = ReadinessGate['metricKey'];
type ReadinessOperator = ReadinessGate['operator'];
type ReadinessEvidenceBehavior = ReadinessGate['missingEvidenceBehavior'];
type ReadinessGateImpact = ReadinessGate['impact'];
type ReadinessTestRunRole = ReadinessGate['dimensions']['testRunRole'];
type ReadinessMinimumTrust = ReadinessGate['minimumTrust'];

const METRIC_LABEL: Record<ReadinessMetricKey, string> = {
  'test.pass_rate': 'readiness.metrics.passRate',
  'test.completion_rate': 'readiness.metrics.completionRate',
  'test.failed_count': 'readiness.metrics.failedCount',
  'gate.form_response': 'readiness.forms.title',
  'accessibility.manual_review': 'readiness.accessibility.title',
  'accessibility.wcag22_aa_violations': 'readiness.metrics.accessibilityViolations',
  'accessibility.wcag22_aa_manual_review': 'readiness.metrics.accessibilityManualReview',
  'performance.lighthouse_score': 'readiness.metrics.lighthouseScore',
};

const OPERATOR_LABEL: Record<ReadinessOperator, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

const EVIDENCE_BEHAVIOR_LABEL: Record<ReadinessEvidenceBehavior, string> = {
  unknown: 'readiness.policies.gates.behaviors.unknown',
  warn: 'readiness.policies.gates.behaviors.warn',
  block: 'readiness.policies.gates.behaviors.block',
};

const IMPACT_LABEL: Record<ReadinessGateImpact, string> = {
  blocking: 'readiness.gates.impacts.blocking',
  warning: 'readiness.gates.impacts.warning',
};

const TEST_RUN_ROLE_LABEL: Record<ReadinessTestRunRole, string> = {
  required: 'readiness.gates.roles.required',
  informational: 'readiness.gates.roles.informational',
};

const MINIMUM_TRUST_LABEL: Record<ReadinessMinimumTrust, string> = {
  verified: 'readiness.evidence.trust.verified',
  authenticated: 'readiness.evidence.trust.authenticated',
  unverified: 'readiness.evidence.trust.unverified',
};

@Component({
  selector: 'app-policy-gate-list',
  imports: [StatusBadge, TranslocoPipe],
  templateUrl: './policy-gate-list.html',
  styleUrl: './policy-gate-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyGateList {
  private readonly i18n = inject(TranslocoService);
  criterionDescription(form: GateFormDefinition, criterion: GateFormCriterion): string {
    const description = gateCriterionDescription(form, criterion);
    const label = description.metric
      ? this.i18n.translate(
          this.metricLabel(
            criterion.type === 'test_results' ? criterion.metricKey : 'test.pass_rate',
          ),
        )
      : description.label;
    const scope =
      criterion.type === 'test_results'
        ? ` · ${this.i18n.translate(this.roleLabel(criterion.testRunRole))}${criterion.minimumPriority ? ` · ${this.i18n.translate(priorityLabel(criterion.minimumPriority))}+` : ''}`
        : '';
    return `${label}: ${description.value === 'checked' ? this.i18n.translate('readiness.forms.checked') : description.value}${scope}`;
  }
  readonly priorityLabel = priorityLabel;
  readonly gates = input.required<ReadonlyArray<ReadinessGate>>();

  metricLabel(metric: ReadinessMetricKey): string {
    return METRIC_LABEL[metric];
  }

  operatorLabel(operator: ReadinessOperator): string {
    return OPERATOR_LABEL[operator];
  }

  expectedValue(gate: ReadinessGate): string {
    if (gate.metricKey === 'performance.lighthouse_score') return `${gate.expected.value}/100`;
    return gate.expected.type === 'percentage'
      ? `${gate.expected.value}%`
      : String(gate.expected.value);
  }

  impactTone(impact: ReadinessGate['impact']): StatusBadgeTone {
    return impact === 'blocking' ? 'danger' : 'warning';
  }

  impactLabel(impact: ReadinessGateImpact): string {
    return IMPACT_LABEL[impact];
  }

  roleLabel(role: ReadinessTestRunRole): string {
    return TEST_RUN_ROLE_LABEL[role];
  }

  behaviorLabel(behavior: ReadinessEvidenceBehavior): string {
    return EVIDENCE_BEHAVIOR_LABEL[behavior];
  }

  trustLabel(trust: ReadinessMinimumTrust): string {
    return MINIMUM_TRUST_LABEL[trust];
  }
}
