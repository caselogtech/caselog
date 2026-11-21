import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { QUALITY_METRIC_DEFINITIONS } from '@caselog/schemas';
import type { ReadinessGateInput } from '@caselog/schemas/readiness';
import { readinessMetricKeySchema } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { Button, FormControlStyle, FormField, StatusBadge } from '../../../../shared/ui/public-api';
import { priorityLabel } from '../../domain/readiness-presentation';
import {
  createPolicyGateForm,
  type PolicyGateEditorForm,
  type PolicyGateForm,
} from './policy-gate-editor-form';

type MetricKey = ReadinessGateInput['metricKey'];
type Operator = ReadinessGateInput['operator'];
type TestRunRole = ReadinessGateInput['dimensions']['testRunRole'];
type Impact = ReadinessGateInput['impact'];
type EvidenceBehavior = ReadinessGateInput['missingEvidenceBehavior'];
type MinimumTrust = ReadinessGateInput['minimumTrust'];

const METRIC_LABEL: Record<MetricKey, string> = {
  'accessibility.manual_review': 'readiness.accessibility.title',
  'test.pass_rate': 'readiness.metrics.passRate',
  'test.completion_rate': 'readiness.metrics.completionRate',
  'test.failed_count': 'readiness.metrics.failedCount',
  'accessibility.wcag22_aa_violations': 'readiness.metrics.accessibilityViolations',
  'accessibility.wcag22_aa_manual_review': 'readiness.metrics.accessibilityManualReview',
  'performance.lighthouse_score': 'readiness.metrics.lighthouseScore',
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
  readonly priorityLabel = priorityLabel;
  readonly browserSession = inject(BrowserSession);
  useMyAccount(gate: PolicyGateForm): void {
    const user = this.browserSession.user();
    if (user) {
      gate.controls.producerKey.setValue(user.id);
      gate.markAsDirty();
    }
  }
  readonly form = input.required<PolicyGateEditorForm>();

  readonly metrics = readinessMetricKeySchema.options.filter(
    (metric) => !metric.startsWith('accessibility.wcag'),
  );
  readonly priorities = ['low', 'medium', 'high', 'critical'] as const;
  metricChanged(gate: PolicyGateForm): void {
    const metric = gate.controls.metricKey.value;
    if (metric === 'accessibility.manual_review') {
      let suffix = 1;
      while (
        this.form().controls.gates.controls.some(
          (other) => other !== gate && other.controls.key.value === `accessibility-${suffix}`,
        )
      )
        suffix++;
      gate.patchValue({
        key: `accessibility-${suffix}`,
        profile: '',
        producerKey: '',
        toolVersion: '',
        minimumPriority: '',
        testRunRole: 'required',
        operator: 'eq',
        expectedValue: '1',
        missingEvidenceBehavior: 'block',
        staleEvidenceBehavior: 'block',
        minimumTrust: 'authenticated',
      });
      return;
    }
    if (metric.startsWith('test.'))
      gate.patchValue({
        profile: '',
        producerKey: '',
        pageUrls: '',
        toolVersion: '',
        runsPerPage: 3,
      });
    else
      gate.patchValue({
        minimumPriority: '',
        runsPerPage: 3,
        testRunRole: 'required',
        staleEvidenceBehavior: 'block',
        operator: metric === 'performance.lighthouse_score' ? 'gte' : 'eq',
        expectedValue:
          metric === 'performance.lighthouse_score'
            ? '90'
            : metric === 'accessibility.wcag22_aa_manual_review'
              ? '1'
              : '0',
      });
  }
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

  isInteger(metric: MetricKey): boolean {
    return QUALITY_METRIC_DEFINITIONS[metric].valueType === 'integer';
  }

  expectedHint(metric: MetricKey): string {
    return QUALITY_METRIC_DEFINITIONS[metric].valueType === 'integer'
      ? 'readiness.policies.editor.integerHint'
      : 'readiness.policies.editor.percentageHint';
  }

  expectedDisplay(metric: MetricKey, value: string | number): string {
    const display = String(value).trim() || '—';
    if (metric === 'performance.lighthouse_score') return `${display}/100`;
    return QUALITY_METRIC_DEFINITIONS[metric].valueType === 'integer' ? display : `${display}%`;
  }
}
