import {
  createPolicyCreateForm,
  createPolicyGateForm,
  toCreateReadinessPolicyRequest,
} from '../../components/policy-gate-editor/policy-gate-editor-form';

describe('policy gate editor form', () => {
  it('converts compatible metric values into typed gate contracts', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production promotion' });
    const gate = form.controls.gates.at(0);
    gate.patchValue({
      key: 'failed-tests',
      metricKey: 'test.failed_count',
      expectedValue: '1.5',
    });
    expect(gate.hasError('incompatibleExpectedValue')).toBe(true);
    expect(form.invalid).toBe(true);

    gate.controls.expectedValue.setValue('0');
    const request = toCreateReadinessPolicyRequest(form);

    expect(request.gates[0]).toMatchObject({
      metricKey: 'test.failed_count',
      expected: { type: 'integer', value: 0 },
      metricVersion: '1.0.0',
    });
  });

  it('rejects duplicate keys and values outside metric ranges at the contract boundary', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production promotion' });
    const first = form.controls.gates.at(0);
    first.patchValue({ key: 'pass-rate', expectedValue: '101' });
    expect(first.hasError('incompatibleExpectedValue')).toBe(true);

    first.controls.expectedValue.setValue('98');
    form.controls.gates.push(
      createPolicyGateForm({
        key: 'pass-rate',
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        dimensions: { testRunRole: 'required' },
        operator: 'gte',
        expected: { type: 'percentage', value: '95' },
        impact: 'warning',
        missingEvidenceBehavior: 'warn',
        staleEvidenceBehavior: 'warn',
        minimumTrust: 'authenticated',
      }),
    );

    expect(form.controls.gates.hasError('duplicateGateKeys')).toBe(true);
    expect(form.invalid).toBe(true);
    expect(() => toCreateReadinessPolicyRequest(form)).toThrow();
  });
});
