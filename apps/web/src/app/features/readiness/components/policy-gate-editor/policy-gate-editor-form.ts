import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  QUALITY_METRIC_DEFINITIONS,
  gateFormDefinitionSchema,
  type GateFormDefinition,
  type TestCasePriority,
} from '@caselog/schemas';
import {
  type CreateReadinessPolicyRequest,
  type CreateReadinessPolicyVersionRequest,
  createReadinessPolicyRequestSchema,
  createReadinessPolicyVersionRequestSchema,
  type ReadinessGateInput,
  readinessGateInputSchema,
} from '@caselog/schemas/readiness';

export type PolicyGateForm = FormGroup<{
  form: FormControl<GateFormDefinition | null>;
  accessibilityStandard: FormControl<string>;
  keyboardNavigation: FormControl<boolean>;
  screenReader: FormControl<boolean>;
  minimumPriority: FormControl<TestCasePriority | ''>;
  profile: FormControl<string>;
  producerKey: FormControl<string>;
  pageUrls: FormControl<string>;
  toolVersion: FormControl<string>;
  device: FormControl<'mobile' | 'desktop'>;
  runsPerPage: FormControl<number>;
  key: FormControl<string>;
  metricKey: FormControl<ReadinessGateInput['metricKey']>;
  testRunRole: FormControl<ReadinessGateInput['dimensions']['testRunRole']>;
  operator: FormControl<ReadinessGateInput['operator']>;
  expectedValue: FormControl<string | number>;
  impact: FormControl<ReadinessGateInput['impact']>;
  missingEvidenceBehavior: FormControl<ReadinessGateInput['missingEvidenceBehavior']>;
  staleEvidenceBehavior: FormControl<ReadinessGateInput['staleEvidenceBehavior']>;
  minimumTrust: FormControl<ReadinessGateInput['minimumTrust']>;
}>;

export type PolicyCreateForm = FormGroup<{
  key: FormControl<string>;
  name: FormControl<string>;
  description: FormControl<string>;
  gates: FormArray<PolicyGateForm>;
}>;

export type PolicyVersionCreateForm = FormGroup<{
  gates: FormArray<PolicyGateForm>;
}>;

export type PolicyGateEditorForm = {
  controls: { gates: FormArray<PolicyGateForm> };
};

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };
const expectedRequired: ValidatorFn = (control) =>
  (typeof control.value === 'number' && Number.isFinite(control.value)) ||
  (typeof control.value === 'string' && control.value.trim())
    ? null
    : { required: true };

const compatibleExpectedValue: ValidatorFn = (control: AbstractControl) => {
  const metricKey = control.get('metricKey')?.value as ReadinessGateInput['metricKey'] | undefined;
  const expectedValue = String(control.get('expectedValue')?.value ?? '').trim();
  if (!metricKey || !expectedValue) return null;

  if (QUALITY_METRIC_DEFINITIONS[metricKey].valueType === 'integer') {
    const value = Number(expectedValue);
    return /^(?:0|[1-9]\d*)$/.test(expectedValue) && Number.isSafeInteger(value)
      ? null
      : { incompatibleExpectedValue: true };
  }

  const value = Number(expectedValue);
  return /^(?:0|[1-9]\d?|100)(?:\.\d{1,9})?$/.test(expectedValue) && value <= 100
    ? null
    : { incompatibleExpectedValue: true };
};

const validMetricScope: ValidatorFn = (control) => {
  const metric = control.get('metricKey')?.value;
  if (typeof metric !== 'string') return null;
  if (metric === 'gate.form_response')
    return gateFormDefinitionSchema.safeParse(control.get('form')?.value).success
      ? null
      : { invalidGateForm: true };
  if (metric.startsWith('test.')) return null;
  if (metric === 'accessibility.manual_review')
    return control.get('accessibilityStandard')?.value?.trim() &&
      validReportPages(String(control.get('pageUrls')?.value ?? ''))
      ? null
      : { invalidMetricScope: true };
  return control.get('profile')?.value?.trim() &&
    control.get('producerKey')?.value?.trim() &&
    validReportPages(String(control.get('pageUrls')?.value ?? '')) &&
    control.get('toolVersion')?.value?.trim() &&
    control.get('testRunRole')?.value === 'required' &&
    (metric !== 'accessibility.wcag22_aa_manual_review' ||
      (control.get('operator')?.value === 'eq' &&
        Number(control.get('expectedValue')?.value) === 1))
    ? null
    : { invalidMetricScope: true };
};

function validReportPages(value: string): boolean {
  const pages = value
    .split(/\r?\n/)
    .map((page) => page.trim())
    .filter(Boolean);
  return (
    pages.length > 0 &&
    pages.length <= 50 &&
    pages.every((page) => {
      try {
        const url = new URL(page);
        return ['https:', 'http:'].includes(url.protocol) && page.length <= 2048;
      } catch {
        return false;
      }
    })
  );
}

const uniqueGateKeys: ValidatorFn = (control: AbstractControl) => {
  const keys = Array.isArray(control.value)
    ? control.value.map(({ key }: { key?: string }) => key?.trim()).filter(Boolean)
    : [];
  return new Set(keys).size === keys.length ? null : { duplicateGateKeys: true };
};

export function defaultGateForm(): GateFormDefinition {
  return {
    name: '',
    description: '',
    fields: [
      {
        key: 'approval',
        label: '',
        description: '',
        type: 'checkbox',
        required: true,
        options: [],
      },
    ],
    criteria: [{ type: 'checkbox', fieldKey: 'approval' }],
  };
}
export function createPolicyGateForm(gate?: ReadinessGateInput): PolicyGateForm {
  return new FormGroup(
    {
      form: new FormControl<GateFormDefinition | null>(
        gate ? (gate.form ?? null) : defaultGateForm(),
      ),
      accessibilityStandard: new FormControl(
        gate?.dimensions.accessibilityStandard ?? 'WCAG 2.2 AA',
        { nonNullable: true, validators: [Validators.maxLength(120)] },
      ),
      keyboardNavigation: new FormControl(
        gate?.dimensions.manualChecks?.includes('keyboard_navigation') ?? true,
        { nonNullable: true },
      ),
      screenReader: new FormControl(
        gate?.dimensions.manualChecks?.includes('screen_reader') ?? true,
        { nonNullable: true },
      ),
      pageUrls: new FormControl(gate?.dimensions.pageUrls?.join('\n') ?? '', { nonNullable: true }),
      toolVersion: new FormControl(gate?.dimensions.toolVersion ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(80)],
      }),
      device: new FormControl<'mobile' | 'desktop'>(gate?.dimensions.device ?? 'mobile', {
        nonNullable: true,
      }),
      runsPerPage: new FormControl(gate?.dimensions.runsPerPage ?? 3, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(3),
          Validators.max(10),
          Validators.pattern(/^\d+$/),
        ],
      }),
      minimumPriority: new FormControl<TestCasePriority | ''>(
        gate?.dimensions.minimumPriority ?? '',
        { nonNullable: true },
      ),
      profile: new FormControl(gate?.dimensions.profile ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(80), Validators.pattern(/^[a-z0-9][a-z0-9._-]{0,79}$/)],
      }),
      producerKey: new FormControl(gate?.producerKey ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(120)],
      }),
      key: new FormControl(gate?.key ?? 'gate-1', {
        nonNullable: true,
        validators: [
          trimmedRequired,
          Validators.maxLength(50),
          Validators.pattern(/^\s*[a-z][a-z0-9_.-]{1,49}\s*$/),
        ],
      }),
      metricKey: new FormControl(gate?.metricKey ?? 'gate.form_response', { nonNullable: true }),
      testRunRole: new FormControl(gate?.dimensions.testRunRole ?? 'required', {
        nonNullable: true,
      }),
      operator: new FormControl(gate?.operator ?? 'eq', { nonNullable: true }),
      expectedValue: new FormControl<string | number>(
        gate
          ? gate.expected.type === 'percentage'
            ? gate.expected.value
            : String(gate.expected.value)
          : '1',
        { nonNullable: true, validators: [expectedRequired] },
      ),
      impact: new FormControl(gate?.impact ?? 'blocking', { nonNullable: true }),
      missingEvidenceBehavior: new FormControl(gate?.missingEvidenceBehavior ?? 'block', {
        nonNullable: true,
      }),
      staleEvidenceBehavior: new FormControl(gate?.staleEvidenceBehavior ?? 'unknown', {
        nonNullable: true,
      }),
      minimumTrust: new FormControl(gate?.minimumTrust ?? 'authenticated', {
        nonNullable: true,
      }),
    },
    { validators: [compatibleExpectedValue, validMetricScope] },
  );
}

export function createPolicyCreateForm(): PolicyCreateForm {
  return new FormGroup({
    key: new FormControl('', {
      nonNullable: true,
      validators: [
        trimmedRequired,
        Validators.maxLength(50),
        Validators.pattern(/^\s*[a-z][a-z0-9-]{1,49}\s*$/),
      ],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [trimmedRequired, Validators.maxLength(120)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2_000)],
    }),
    gates: createPolicyGateArray(),
  });
}

export function createPolicyVersionCreateForm(
  gates: ReadonlyArray<ReadinessGateInput> = [],
): PolicyVersionCreateForm {
  return new FormGroup({ gates: createPolicyGateArray(gates) });
}

export function toReadinessGateInput(form: PolicyGateForm): ReadinessGateInput {
  const value = form.getRawValue();
  if (value.metricKey === 'gate.form_response')
    return readinessGateInputSchema.parse({
      key: value.key.trim(),
      form: value.form,
      metricKey: 'gate.form_response',
      metricVersion: '1.0.0',
      dimensions: { testRunRole: 'required' },
      operator: 'eq',
      expected: { type: 'integer', value: 1 },
      impact: value.impact,
      missingEvidenceBehavior: 'block',
      staleEvidenceBehavior: 'block',
      minimumTrust: 'authenticated',
    });
  return readinessGateInputSchema.parse({
    key: value.key.trim(),
    metricKey: value.metricKey,
    metricVersion: '1.0.0',
    dimensions: {
      testRunRole: value.testRunRole,
      ...(value.minimumPriority ? { minimumPriority: value.minimumPriority } : {}),
      ...(!value.metricKey.startsWith('test.')
        ? {
            ...(value.metricKey !== 'accessibility.manual_review'
              ? { profile: value.profile.trim(), toolVersion: value.toolVersion.trim() }
              : {
                  accessibilityStandard: value.accessibilityStandard.trim(),
                  manualChecks: [
                    ...(value.keyboardNavigation ? ['keyboard_navigation'] : []),
                    ...(value.screenReader ? ['screen_reader'] : []),
                  ],
                }),
            pageUrls: [
              ...new Set(
                value.pageUrls
                  .split(/\r?\n/)
                  .map((page) => page.trim())
                  .filter(Boolean),
              ),
            ].sort(),
            ...(value.metricKey === 'performance.lighthouse_score'
              ? { device: value.device, runsPerPage: value.runsPerPage }
              : {}),
          }
        : {}),
    },
    ...(value.metricKey !== 'accessibility.manual_review' && value.producerKey.trim()
      ? { producerKey: value.producerKey.trim() }
      : {}),
    operator: value.metricKey === 'accessibility.manual_review' ? 'eq' : value.operator,
    expected:
      QUALITY_METRIC_DEFINITIONS[value.metricKey].valueType === 'integer'
        ? {
            type: 'integer',
            value:
              value.metricKey === 'accessibility.manual_review' ? 1 : Number(value.expectedValue),
          }
        : { type: 'percentage', value: String(value.expectedValue).trim() },
    impact: value.impact,
    missingEvidenceBehavior:
      value.metricKey === 'accessibility.manual_review' ? 'block' : value.missingEvidenceBehavior,
    staleEvidenceBehavior:
      value.metricKey === 'accessibility.manual_review' ? 'block' : value.staleEvidenceBehavior,
    minimumTrust:
      value.metricKey === 'accessibility.manual_review' ? 'authenticated' : value.minimumTrust,
  });
}

export function toCreateReadinessPolicyRequest(
  form: PolicyCreateForm,
): CreateReadinessPolicyRequest {
  const value = form.getRawValue();
  return createReadinessPolicyRequestSchema.parse({
    key: value.key.trim(),
    name: value.name.trim(),
    description: value.description.trim() || null,
    gates: form.controls.gates.controls.map(toReadinessGateInput),
  });
}

export function toCreateReadinessPolicyVersionRequest(
  form: PolicyVersionCreateForm,
): CreateReadinessPolicyVersionRequest {
  return createReadinessPolicyVersionRequestSchema.parse({
    gates: form.controls.gates.controls.map(toReadinessGateInput),
  });
}

function createPolicyGateArray(
  gates: ReadonlyArray<ReadinessGateInput> = [],
): FormArray<PolicyGateForm> {
  return new FormArray(
    gates.length > 0 ? gates.map((gate) => createPolicyGateForm(gate)) : [createPolicyGateForm()],
    { validators: [Validators.minLength(1), Validators.maxLength(50), uniqueGateKeys] },
  );
}
