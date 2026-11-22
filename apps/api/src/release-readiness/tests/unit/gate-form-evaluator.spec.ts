import { describe, expect, it } from 'vitest';
import {
  gateFormDefinitionSchema,
  gateFormResponseRequestSchema,
  validateGateFormAnswers,
} from '@caselog/schemas';
import { readinessGateInputSchema } from '@caselog/schemas/readiness';
import { evidenceIngestRequestSchema } from '@caselog/schemas/evidence';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';
import type { ReadinessGate } from '../../domain/models/readiness-policy';
import { evaluateReadiness } from '../../domain/policies/readiness-evaluator';
import { qualityAnswers, qualityForm, formGateInput } from '../support/gate-form.fixture';
const gate: ReadinessGate = {
  ...formGateInput,
  id: '00000000-0000-4000-8000-000000000001',
  position: 0,
  operator: 'EQ',
  impact: 'BLOCKING',
  minimumTrust: 'AUTHENTICATED',
  missingEvidenceBehavior: 'BLOCK',
  staleEvidenceBehavior: 'BLOCK',
};
const at = '2026-11-22T12:00:00.000Z';
function response(patch: Partial<ReadinessEvidence> = {}): ReadinessEvidence {
  return {
    observationId: '00000000-0000-4000-8000-000000000002',
    producerId: 'producer',
    producerKey: 'caselog.gate-forms',
    metricKey: 'gate.form_response',
    metricVersion: '1.0.0',
    dimensions: { testRunRole: 'required', gateId: gate.id },
    value: { type: 'integer', value: 1 },
    state: 'AVAILABLE',
    trust: 'AUTHENTICATED',
    observedAt: at,
    expiresAt: null,
    formResponse: {
      kind: 'gate_form_response',
      actorId: gate.id,
      reviewerName: 'Reviewer',
      values: { ...qualityAnswers },
      reports: [],
    },
    ...patch,
  };
}
const evaluate = (evidence: ReadinessEvidence[], selectedGate = gate) =>
  evaluateReadiness({ gates: [selectedGate], evidence, evaluatedAt: at });
describe('custom gate form evaluation', () => {
  it('distinguishes a required false answer from a checked passing condition', () => {
    const values = { ...qualityAnswers, keyboard: false };
    expect(validateGateFormAnswers(qualityForm, values)).toEqual([]);
    const evidence = response();
    if (!evidence.formResponse) throw new Error('Missing response');
    evidence.formResponse.values = values;
    expect(evaluate([evidence])).toMatchObject({
      status: 'BLOCKED',
      gates: [
        {
          criteria: [
            { result: 'passed' },
            { result: 'failed', actual: 'false' },
            { result: 'passed' },
          ],
        },
      ],
    });
    expect(evaluate([response()]).status).toBe('READY');
  });
  it('blocks missing, wrong-gate, forged producer, untrusted and expired responses', () => {
    for (const evidence of [
      [],
      [response({ dimensions: { testRunRole: 'required', gateId: 'other' } })],
      [response({ producerKey: 'external' })],
      [response({ trust: 'UNVERIFIED' })],
      [response({ expiresAt: at })],
    ]) {
      expect(evaluate(evidence).status).toBe('BLOCKED');
    }
    expect(evaluate([response({ expiresAt: at })]).gates[0]?.criteria?.[0]?.diagnostic).toBe(
      'stale',
    );
  });
  it('requires every condition and keeps evidence references for mixed native and human checks', () => {
    const mixed: ReadinessGate = {
      ...gate,
      form: {
        ...qualityForm,
        criteria: [
          ...qualityForm.criteria,
          {
            type: 'test_results',
            metricKey: 'test.pass_rate',
            minimumPriority: 'medium',
            testRunRole: 'required',
            operator: 'gte',
            expected: 100,
          },
        ],
      },
    };
    const native: ReadinessEvidence = {
      ...response(),
      observationId: '00000000-0000-4000-8000-000000000003',
      producerKey: 'caselog.test-runs',
      metricKey: 'test.pass_rate',
      dimensions: { testRunRole: 'required', minimumPriority: 'medium' },
      value: { type: 'percentage', value: '100' },
      formResponse: undefined,
    };
    expect(evaluate([response()], mixed).status).toBe('BLOCKED');
    const result = evaluate([response(), native], mixed);
    expect(result.status).toBe('READY');
    expect(result.gates[0]?.criteria?.at(-1)?.observationId).toBe(native.observationId);
    expect(evaluate([response(), { ...native, producerKey: 'external' }], mixed).status).toBe(
      'BLOCKED',
    );
    expect(evaluate([native, response()], mixed)).toEqual(result);
  });
  it('evaluates tests-only forms without a human response and treats warning failures as at risk', () => {
    const automatic: ReadinessGate = {
      ...gate,
      form: {
        ...qualityForm,
        fields: [],
        criteria: [
          {
            type: 'test_results',
            metricKey: 'test.failed_count',
            testRunRole: 'required',
            operator: 'eq',
            expected: 0,
          },
        ],
      },
    };
    const native = response({
      producerKey: 'caselog.test-runs',
      metricKey: 'test.failed_count',
      dimensions: { testRunRole: 'required' },
      value: { type: 'integer', value: 0 },
    });
    expect(evaluate([native], automatic).status).toBe('READY');
    expect(evaluate([], { ...gate, impact: 'WARNING' }).status).toBe('AT_RISK');
  });
  it('validates requiredness, types, options, limits, URLs and dangling field references', () => {
    expect(validateGateFormAnswers(qualityForm, { ...qualityAnswers, unexpected: true })).toEqual([
      'unexpected',
    ]);
    expect(validateGateFormAnswers(qualityForm, { ...qualityAnswers, score: '92' })).toEqual([
      'score',
    ]);
    expect(validateGateFormAnswers(qualityForm, { keyboard: false })).toContain('standard');
    expect(
      gateFormDefinitionSchema.safeParse({
        ...qualityForm,
        fields: [qualityForm.fields[0], qualityForm.fields[0]],
      }).success,
    ).toBe(false);
    expect(
      gateFormDefinitionSchema.safeParse({
        ...qualityForm,
        criteria: [{ type: 'checkbox', fieldKey: 'unknown' }],
      }).success,
    ).toBe(false);
    expect(gateFormDefinitionSchema.safeParse({ ...qualityForm, criteria: [] }).success).toBe(
      false,
    );
    expect(
      gateFormResponseRequestSchema.safeParse({
        values: { notes: 'x'.repeat(4001) },
        expectedObservationId: null,
      }).success,
    ).toBe(false);
    const form = gateFormDefinitionSchema.parse({
      name: 'Review',
      fields: [
        {
          key: 'outcome',
          label: 'Outcome',
          type: 'select',
          required: true,
          options: [
            { key: 'ok', label: 'OK' },
            { key: 'not_ok', label: 'Not OK' },
          ],
        },
        { key: 'url', label: 'Report URL', type: 'url', required: false },
      ],
      criteria: [{ type: 'select', fieldKey: 'outcome', expected: 'ok' }],
    });
    expect(
      validateGateFormAnswers(form, { outcome: 'not_ok', url: 'javascript:alert(1)' }),
    ).toEqual(['url']);
    expect(validateGateFormAnswers(form, { outcome: 'other' })).toEqual(['outcome']);

    const oversized = gateFormDefinitionSchema.safeParse({
      name: 'Large review',
      fields: Array.from({ length: 30 }, (_, field) => ({
        key: `field_${field}`,
        label: 'Choice',
        type: 'select',
        required: false,
        options: Array.from({ length: 30 }, (_, option) => ({
          key: `option_${option}`,
          label: 'Ж'.repeat(70),
        })),
      })),
      criteria: [{ type: 'select', fieldKey: 'field_0', expected: 'option_0' }],
    });
    expect(oversized.success).toBe(false);
    if (!oversized.success)
      expect(oversized.error.issues.some(({ message }) => message.includes('UTF-8 bytes'))).toBe(
        true,
      );
    expect(readinessGateInputSchema.safeParse(formGateInput).success).toBe(true);
    expect(
      readinessGateInputSchema.safeParse({ ...formGateInput, minimumTrust: 'unverified' }).success,
    ).toBe(false);
    expect(
      evidenceIngestRequestSchema.safeParse({
        candidateId: gate.id,
        metricKey: 'gate.form_response',
      }).success,
    ).toBe(false);
  });
});
