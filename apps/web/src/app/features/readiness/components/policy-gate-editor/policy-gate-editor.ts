import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { ReadinessGateInput } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField, StatusBadge } from '../../../../shared/ui/public-api';
import { createPolicyGateForm, type PolicyCreateForm } from './policy-gate-editor-form';

type MetricKey = ReadinessGateInput['metricKey'];
type Operator = ReadinessGateInput['operator'];
type TestRunRole = ReadinessGateInput['dimensions']['testRunRole'];
type Impact = ReadinessGateInput['impact'];
type EvidenceBehavior = ReadinessGateInput['missingEvidenceBehavior'];
type MinimumTrust = ReadinessGateInput['minimumTrust'];

const METRIC_LABEL: Record<MetricKey, string> = {
  'test.pass_rate': 'readiness.metrics.passRate',
  'test.completion_rate': 'readiness.metrics.completionRate',
  'test.failed_count': 'readiness.metrics.failedCount',
};

const ROLE_LABEL: Record<TestRunRole, string> = {
  required: 'readiness.gates.roles.required',
  informational: 'readiness.gates.roles.informational',
};

const IMPACT_LABEL: Record<Impact, string> = {
  blocking: 'readiness.gates.impacts.blocking',
  warning: 'readiness.gates.impacts.warning',
};

const BEHAVIOR_LABEL: Record<EvidenceBehavior, string> = {
  unknown: 'readiness.policies.gates.behaviors.unknown',
  warn: 'readiness.policies.gates.behaviors.warn',
  block: 'readiness.policies.gates.behaviors.block',
};

const TRUST_LABEL: Record<MinimumTrust, string> = {
  verified: 'readiness.evidence.trust.verified',
  authenticated: 'readiness.evidence.trust.authenticated',
  unverified: 'readiness.evidence.trust.unverified',
};

@Component({
  selector: 'app-policy-gate-editor',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, StatusBadge, TranslocoPipe],
  templateUrl: './policy-gate-editor.html',
  styleUrl: './policy-gate-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyGateEditor {
  readonly form = input.required<PolicyCreateForm>();

  readonly metrics: MetricKey[] = ['test.pass_rate', 'test.completion_rate', 'test.failed_count'];
  readonly operators: Operator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];
  readonly roles: TestRunRole[] = ['required', 'informational'];
  readonly impacts: Impact[] = ['blocking', 'warning'];
  readonly behaviors: EvidenceBehavior[] = ['unknown', 'warn', 'block'];
  readonly trustLevels: MinimumTrust[] = ['verified', 'authenticated', 'unverified'];

  addGate(): void {
    if (this.form().controls.gates.length >= 50) return;
    this.form().controls.gates.push(createPolicyGateForm());
    this.form().controls.gates.markAsDirty();
  }

  removeGate(index: number): void {
    const gates = this.form().controls.gates;
    if (gates.length === 1) return;
    gates.removeAt(index);
    gates.markAsDirty();
  }

  moveGate(index: number, offset: -1 | 1): void {
    const gates = this.form().controls.gates;
    const destination = index + offset;
    if (destination < 0 || destination >= gates.length) return;
    const gate = gates.at(index);
    gates.removeAt(index);
    gates.insert(destination, gate);
    gates.markAsDirty();
  }

  metricLabel(metric: MetricKey): string {
    return METRIC_LABEL[metric];
  }

  duplicateKey(index: number): boolean {
    const current = this.form().controls.gates.at(index).controls.key.value.trim();
    return Boolean(
      current &&
        this.form().controls.gates.controls.some(
          (gate, gateIndex) => gateIndex !== index && gate.controls.key.value.trim() === current,
        ),
    );
  }

  roleLabel(role: TestRunRole): string {
    return ROLE_LABEL[role];
  }

  impactLabel(impact: Impact): string {
    return IMPACT_LABEL[impact];
  }

  behaviorLabel(behavior: EvidenceBehavior): string {
    return BEHAVIOR_LABEL[behavior];
  }

  trustLabel(trust: MinimumTrust): string {
    return TRUST_LABEL[trust];
  }

  operatorLabel(operator: Operator): string {
    return { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[operator];
  }

  expectedHint(metric: MetricKey): string {
    return metric === 'test.failed_count'
      ? 'readiness.policies.editor.integerHint'
      : 'readiness.policies.editor.percentageHint';
  }

  expectedDisplay(metric: MetricKey, value: string): string {
    return metric === 'test.failed_count' ? value || '—' : `${value || '—'}%`;
  }
}
