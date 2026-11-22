import { priorityLabel } from '../../domain/readiness-presentation';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FormControl, FormsModule } from '@angular/forms';
import type { GateFormCriterion, GateFormDefinition, GateFormField } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import { defaultGateForm } from '../policy-gate-editor/policy-gate-editor-form';

@Component({
  selector: 'app-gate-form-definition-editor',
  imports: [FormsModule, TranslocoPipe, Button, FormControlStyle, FormField],
  templateUrl: './gate-form-definition-editor.html',
  styleUrl: './gate-form-definition-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GateFormDefinitionEditor {
  readonly priorityLabel = priorityLabel;
  readonly control = input.required<FormControl<GateFormDefinition | null>>();
  readonly prefix = input.required<string>();
  readonly fieldTypes: GateFormField['type'][] = [
    'text',
    'textarea',
    'number',
    'checkbox',
    'select',
    'url',
    'files',
  ];
  readonly conditionTypes: GateFormCriterion['type'][] = [
    'checkbox',
    'number',
    'select',
    'test_results',
  ];
  readonly operators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'] as const;
  readonly metrics = ['test.pass_rate', 'test.completion_rate', 'test.failed_count'] as const;
  readonly priorities = ['', 'low', 'medium', 'high', 'critical'] as const;
  get form(): GateFormDefinition {
    return this.control().value ?? defaultGateForm();
  }
  change(patch: Partial<GateFormDefinition>): void {
    this.control().setValue({ ...this.form, ...patch });
    this.control().markAsDirty();
  }
  field(index: number, patch: Partial<GateFormField>): void {
    this.change({
      fields: this.form.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    });
  }
  changeType(index: number, type: GateFormField['type']): void {
    this.field(index, {
      type,
      options: type === 'select' ? [{ key: 'option_1', label: '' }] : [],
    });
  }
  addField(): void {
    if (this.form.fields.length >= 30) return;
    let suffix = 1;
    while (this.form.fields.some(({ key }) => key === `field_${suffix}`)) suffix++;
    this.change({
      fields: [
        ...this.form.fields,
        {
          key: `field_${suffix}`,
          label: '',
          type: 'text',
          description: '',
          required: false,
          options: [],
        },
      ],
    });
  }
  removeField(index: number): void {
    const key = this.form.fields[index]?.key;
    this.change({
      fields: this.form.fields.filter((_, i) => i !== index),
      criteria: this.form.criteria.filter(
        (criterion) => criterion.type === 'test_results' || criterion.fieldKey !== key,
      ),
    });
  }
  addOption(index: number): void {
    const field = this.form.fields[index];
    if (!field || field.options.length >= 30) return;
    let suffix = 1;
    while (field.options.some(({ key }) => key === `option_${suffix}`)) suffix++;
    this.field(index, { options: [...field.options, { key: `option_${suffix}`, label: '' }] });
  }
  option(fieldIndex: number, index: number, label: string): void {
    const field = this.form.fields[fieldIndex];
    if (field)
      this.field(fieldIndex, {
        options: field.options.map((option, i) => (i === index ? { ...option, label } : option)),
      });
  }
  removeOption(fieldIndex: number, index: number): void {
    const field = this.form.fields[fieldIndex];
    if (field) this.field(fieldIndex, { options: field.options.filter((_, i) => i !== index) });
  }
  addCriterion(type: GateFormCriterion['type'] = 'test_results'): void {
    if (this.form.criteria.length < 20)
      this.change({ criteria: [...this.form.criteria, this.newCriterion(type)] });
  }
  criterionType(index: number, type: GateFormCriterion['type']): void {
    this.replaceCriterion(index, this.newCriterion(type));
  }
  replaceCriterion(index: number, criterion: GateFormCriterion): void {
    this.change({
      criteria: this.form.criteria.map((item, i) => (i === index ? criterion : item)),
    });
  }
  removeCriterion(index: number): void {
    this.change({ criteria: this.form.criteria.filter((_, i) => i !== index) });
  }
  matchingFields(type: GateFormCriterion['type']): GateFormField[] {
    return this.form.fields.filter((field) => field.type === type);
  }
  options(key: string) {
    return this.form.fields.find((field) => field.key === key)?.options ?? [];
  }
  fieldCondition(index: number, criterion: GateFormCriterion, fieldKey: string): void {
    if (criterion.type === 'test_results') return;
    this.replaceCriterion(
      index,
      criterion.type === 'select'
        ? { ...criterion, fieldKey, expected: this.options(fieldKey)[0]?.key ?? '' }
        : { ...criterion, fieldKey },
    );
  }
  fieldTypeLabel(type: GateFormField['type']): string {
    return {
      text: 'readiness.forms.types.text',
      textarea: 'readiness.forms.types.textarea',
      number: 'readiness.forms.types.number',
      checkbox: 'readiness.forms.types.checkbox',
      select: 'readiness.forms.types.select',
      url: 'readiness.forms.types.url',
      files: 'readiness.forms.types.files',
    }[type];
  }
  criterionLabel(type: GateFormCriterion['type']): string {
    return {
      checkbox: 'readiness.forms.conditions.checkbox',
      number: 'readiness.forms.conditions.number',
      select: 'readiness.forms.conditions.select',
      test_results: 'readiness.forms.conditions.testResults',
    }[type];
  }
  metricLabel(metric: string): string {
    return (
      {
        'test.pass_rate': 'readiness.metrics.passRate',
        'test.completion_rate': 'readiness.metrics.completionRate',
        'test.failed_count': 'readiness.metrics.failedCount',
      }[metric] ?? 'readiness.metrics.passRate'
    );
  }
  operatorLabel(operator: (typeof this.operators)[number]): string {
    return { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[operator];
  }
  private newCriterion(type: GateFormCriterion['type']): GateFormCriterion {
    const fieldKey = this.matchingFields(type)[0]?.key ?? '';
    if (type === 'test_results')
      return {
        type,
        metricKey: 'test.pass_rate',
        testRunRole: 'required',
        operator: 'gte',
        expected: 100,
      };
    if (type === 'number') return { type, fieldKey, operator: 'gte', expected: 0 };
    if (type === 'select')
      return { type, fieldKey, expected: this.options(fieldKey)[0]?.key ?? '' };
    return { type, fieldKey };
  }
}
