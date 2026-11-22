import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { QUALITY_METRIC_DEFINITIONS } from '@caselog/schemas';
import type { ReadinessGateInput } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import { metricLabel } from '../../domain/readiness-presentation';
import { GateFormDefinitionEditor } from '../gate-form-definition-editor/gate-form-definition-editor';
import {
  createPolicyGateForm,
  defaultGateForm,
  type PolicyGateEditorForm,
  type PolicyGateForm,
} from './policy-gate-editor-form';

@Component({
  selector: 'app-policy-gate-editor',
  imports: [
    GateFormDefinitionEditor,
    Button,
    FormControlStyle,
    FormField,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './policy-gate-editor.html',
  styleUrl: './policy-gate-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyGateEditor {
  readonly form = input.required<PolicyGateEditorForm>();
  readonly metricLabel = metricLabel;
  readonly impacts = ['blocking', 'warning'] as const;
  addGate(): void {
    if (this.form().controls.gates.length >= 50) return;
    const gate = createPolicyGateForm();
    let suffix = 1;
    while (
      this.form().controls.gates.controls.some(
        (other) => other.controls.key.value === `gate-${suffix}`,
      )
    )
      suffix++;
    gate.controls.key.setValue(`gate-${suffix}`);
    this.form().controls.gates.push(gate);
    this.form().controls.gates.markAsDirty();
  }
  replaceWithForm(gate: PolicyGateForm): void {
    const form = defaultGateForm();
    form.name = gate.controls.key.value;
    const metric = gate.controls.metricKey.value;
    if (
      metric === 'test.pass_rate' ||
      metric === 'test.completion_rate' ||
      metric === 'test.failed_count'
    ) {
      form.fields = [];
      form.criteria = [
        {
          type: 'test_results',
          metricKey: metric,
          testRunRole: gate.controls.testRunRole.value,
          ...(gate.controls.minimumPriority.value
            ? { minimumPriority: gate.controls.minimumPriority.value }
            : {}),
          operator: gate.controls.operator.value,
          expected: Number(gate.controls.expectedValue.value),
        },
      ];
    }
    gate.patchValue({ form, metricKey: 'gate.form_response', operator: 'eq', expectedValue: '1' });
    gate.markAsDirty();
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
  duplicateKey(index: number): boolean {
    const current = this.form().controls.gates.at(index).controls.key.value.trim();
    return Boolean(
      current &&
        this.form().controls.gates.controls.some(
          (gate, i) => i !== index && gate.controls.key.value.trim() === current,
        ),
    );
  }
  impactLabel(impact: ReadinessGateInput['impact']): string {
    return impact === 'blocking'
      ? 'readiness.gates.impacts.blocking'
      : 'readiness.gates.impacts.warning';
  }
  operatorLabel(operator: ReadinessGateInput['operator']): string {
    return { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[operator];
  }
  expectedDisplay(metric: ReadinessGateInput['metricKey'], value: string | number): string {
    const display = String(value).trim() || '—';
    return metric === 'performance.lighthouse_score'
      ? `${display}/100`
      : QUALITY_METRIC_DEFINITIONS[metric].valueType === 'integer'
        ? display
        : `${display}%`;
  }
}
