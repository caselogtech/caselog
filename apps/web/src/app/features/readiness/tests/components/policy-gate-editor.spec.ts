import {
  createPolicyCreateForm,
  createPolicyGateForm,
  toCreateReadinessPolicyRequest,
} from '../../components/policy-gate-editor/policy-gate-editor-form';

describe('policy gate editor form', () => {
  it('requires a named form with valid field references and maps custom conditions', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production' });
    const gate = form.controls.gates.at(0);
    expect(form.invalid).toBe(true);
    gate.controls.form.setValue({
      name: 'Quality approval',
      description: 'Review',
      fields: [
        {
          key: 'approval',
          label: 'Approved',
          description: '',
          type: 'checkbox',
          required: true,
          options: [],
        },
      ],
      criteria: [
        { type: 'checkbox', fieldKey: 'approval' },
        {
          type: 'test_results',
          metricKey: 'test.pass_rate',
          testRunRole: 'required',
          minimumPriority: 'medium',
          operator: 'gte',
          expected: 100,
        },
      ],
    });
    expect(form.valid).toBe(true);
    expect(toCreateReadinessPolicyRequest(form).gates[0]).toMatchObject({
      metricKey: 'gate.form_response',
      form: {
        name: 'Quality approval',
        criteria: [{ type: 'checkbox' }, { type: 'test_results', minimumPriority: 'medium' }],
      },
      staleEvidenceBehavior: 'block',
    });
    const definition = gate.controls.form.value;
    if (!definition) throw new Error('Missing form');
    gate.controls.form.setValue({ ...definition, fields: [] });
    expect(form.invalid).toBe(true);
  });
  it('maps simple manual accessibility requirements without technical source or measurement settings', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production' });
    const gate = form.controls.gates.at(0);
    gate.patchValue({
      key: 'accessibility',
      metricKey: 'accessibility.manual_review',
      expectedValue: '1',
      pageUrls: 'https://example.com/',
      operator: 'eq',
    });
    expect(form.valid).toBe(true);
    const input = toCreateReadinessPolicyRequest(form).gates[0];
    expect(input).toMatchObject({
      dimensions: {
        accessibilityStandard: 'WCAG 2.2 AA',
        pageUrls: ['https://example.com/'],
        manualChecks: ['keyboard_navigation', 'screen_reader'],
      },
      operator: 'eq',
      expected: { type: 'integer', value: 1 },
      missingEvidenceBehavior: 'block',
    });
    expect(input?.producerKey).toBeUndefined();
    expect(input?.dimensions.profile).toBeUndefined();
  });
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

  it('maps numeric input values and complete external profiles without losing their context', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production readiness' });
    const gate = form.controls.gates.at(0);
    gate.patchValue({
      key: 'lighthouse',
      metricKey: 'performance.lighthouse_score',
      expectedValue: 90,
      producerKey: 'ci-token',
      profile: 'production-mobile-v1',
      pageUrls: 'https://example.com/checkout\nhttps://example.com/',
      toolVersion: 'pinned-v1',
      runsPerPage: 3,
    });
    expect(form.valid).toBe(true);
    expect(toCreateReadinessPolicyRequest(form).gates[0]).toMatchObject({
      expected: { type: 'percentage', value: '90' },
      producerKey: 'ci-token',
      dimensions: {
        pageUrls: ['https://example.com/', 'https://example.com/checkout'],
        device: 'mobile',
        runsPerPage: 3,
      },
    });
    gate.controls.runsPerPage.setValue(3.5);
    expect(form.invalid).toBe(true);
    gate.controls.runsPerPage.setValue(3);
    gate.controls.pageUrls.setValue('invalid');
    expect(form.invalid).toBe(true);
  });

  it('rejects duplicate keys and values outside metric ranges at the contract boundary', () => {
    const form = createPolicyCreateForm();
    form.patchValue({ key: 'production', name: 'Production promotion' });
    const first = form.controls.gates.at(0);
    first.patchValue({ key: 'pass-rate', metricKey: 'test.pass_rate', expectedValue: '101' });
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
