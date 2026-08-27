import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  createReadinessPolicyRequestSchema,
  createReadinessPolicyVersionRequestSchema,
  readinessGateInputSchema,
  type CreateReadinessPolicyRequest,
  type CreateReadinessPolicyVersionRequest,
  type ReadinessGateInput,
} from '@caselog/schemas/readiness';

export type PolicyGateForm = FormGroup<{
  key: FormControl<string>;
  metricKey: FormControl<ReadinessGateInput['metricKey']>;
  testRunRole: FormControl<ReadinessGateInput['dimensions']['testRunRole']>;
  operator: FormControl<ReadinessGateInput['operator']>;
  expectedValue: FormControl<string>;
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

const compatibleExpectedValue: ValidatorFn = (control: AbstractControl) => {
  const metricKey = control.get('metricKey')?.value as ReadinessGateInput['metricKey'] | undefined;
  const expectedValue = String(control.get('expectedValue')?.value ?? '').trim();
  if (!metricKey || !expectedValue) return null;

  if (metricKey === 'test.failed_count') {
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

const uniqueGateKeys: ValidatorFn = (control: AbstractControl) => {
  const keys = Array.isArray(control.value)
    ? control.value.map(({ key }: { key?: string }) => key?.trim()).filter(Boolean)
    : [];
  return new Set(keys).size === keys.length ? null : { duplicateGateKeys: true };
};

export function createPolicyGateForm(gate?: ReadinessGateInput): PolicyGateForm {
  return new FormGroup(
    {
      key: new FormControl(gate?.key ?? '', {
        nonNullable: true,
        validators: [
          trimmedRequired,
          Validators.maxLength(50),
          Validators.pattern(/^\s*[a-z][a-z0-9_.-]{1,49}\s*$/),
        ],
      }),
      metricKey: new FormControl(gate?.metricKey ?? 'test.pass_rate', { nonNullable: true }),
      testRunRole: new FormControl(gate?.dimensions.testRunRole ?? 'required', {
        nonNullable: true,
      }),
      operator: new FormControl(gate?.operator ?? 'gte', { nonNullable: true }),
      expectedValue: new FormControl(
        gate
          ? gate.expected.type === 'percentage'
            ? gate.expected.value
            : String(gate.expected.value)
          : '98',
        { nonNullable: true, validators: [trimmedRequired] },
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
    { validators: [compatibleExpectedValue] },
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
  return readinessGateInputSchema.parse({
    key: value.key.trim(),
    metricKey: value.metricKey,
    metricVersion: '1.0.0',
    dimensions: { testRunRole: value.testRunRole },
    operator: value.operator,
    expected:
      value.metricKey === 'test.failed_count'
        ? { type: 'integer', value: Number(value.expectedValue) }
        : { type: 'percentage', value: value.expectedValue.trim() },
    impact: value.impact,
    missingEvidenceBehavior: value.missingEvidenceBehavior,
    staleEvidenceBehavior: value.staleEvidenceBehavior,
    minimumTrust: value.minimumTrust,
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
