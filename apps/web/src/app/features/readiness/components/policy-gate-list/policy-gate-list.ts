import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ReadinessPolicy } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';

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
  readonly gates = input.required<ReadonlyArray<ReadinessGate>>();

  metricLabel(metric: ReadinessMetricKey): string {
    return METRIC_LABEL[metric];
  }

  operatorLabel(operator: ReadinessOperator): string {
    return OPERATOR_LABEL[operator];
  }

  expectedValue(gate: ReadinessGate): string {
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
