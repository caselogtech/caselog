import { describe, expect, it } from 'vitest';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';
import {
  type EvidenceBehavior,
  type ReadinessGate,
  type ReadinessOperator,
  validateReadinessGates,
} from '../../domain/models/readiness-policy';
import { evaluateReadiness } from '../../domain/policies/readiness-evaluator';

describe('readiness evaluator', () => {
  it.each([
    ['EQ', '90.000000000', true],
    ['NE', '90.000000000', false],
    ['GT', '89.999999999', true],
    ['GTE', '90', true],
    ['LT', '90.000000001', true],
    ['LTE', '90', true],
  ] satisfies Array<[ReadinessOperator, string, boolean]>)(
    'evaluates %s at exact decimal boundaries',
    (operator, expected, passes) => {
      const result = evaluateReadiness({
        gates: [gate({ operator, expected: { type: 'percentage', value: expected } })],
        evidence: [observation()],
        evaluatedAt: '2026-08-26T12:00:00.000Z',
      });
      expect(result.gates[0]?.result).toBe(passes ? 'PASSED' : 'FAILED');
    },
  );

  it.each([
    ['UNKNOWN', 'UNKNOWN'],
    ['WARN', 'WARNING'],
    ['BLOCK', 'FAILED'],
  ] satisfies Array<[EvidenceBehavior, string]>)(
    'applies %s when evidence is missing',
    (behavior, result) => {
      const evaluation = evaluateReadiness({
        gates: [gate({ missingEvidenceBehavior: behavior })],
        evidence: [],
        evaluatedAt: '2026-08-26T12:00:00.000Z',
      });
      expect(evaluation.gates[0]).toMatchObject({ result, diagnostic: 'MISSING' });
    },
  );

  it.each([
    [observation({ state: 'INCOMPLETE', value: null }), {}, 'INCOMPLETE'],
    [observation({ expiresAt: '2026-08-26T11:59:59.999Z' }), {}, 'STALE'],
    [observation({ trust: 'AUTHENTICATED' }), { minimumTrust: 'VERIFIED' }, 'UNTRUSTED'],
  ] satisfies Array<[ReadinessEvidence, Partial<ReadinessGate>, string]>)(
    'reports %s evidence diagnostics',
    (evidence, gateOverrides, diagnostic) => {
      const evaluation = evaluateReadiness({
        gates: [gate(gateOverrides)],
        evidence: [evidence],
        evaluatedAt: '2026-08-26T12:00:00.000Z',
      });
      expect(evaluation.gates[0]?.diagnostic).toBe(diagnostic);
    },
  );

  it('selects fresh evidence by trust, observation time and stable id', () => {
    const evidence = [
      observation({
        observationId: 'z',
        trust: 'AUTHENTICATED',
        observedAt: '2026-08-26T11:59:00Z',
      }),
      observation({ observationId: 'b', trust: 'VERIFIED', observedAt: '2026-08-26T11:58:00Z' }),
      observation({ observationId: 'a', trust: 'VERIFIED', observedAt: '2026-08-26T11:58:00Z' }),
    ];
    const evaluation = evaluateReadiness({
      gates: [gate()],
      evidence,
      evaluatedAt: '2026-08-26T12:00:00.000Z',
    });
    expect(evaluation.gates[0]?.selectedObservationId).toBe('a');
  });

  it('uses blocking, unknown and warning precedence independent of gate order', () => {
    const evaluation = evaluateReadiness({
      gates: [
        gate({ id: 'warning', key: 'warning', position: 2, impact: 'WARNING' }),
        gate({
          id: 'unknown',
          key: 'unknown',
          position: 1,
          dimensions: { testRunRole: 'informational' },
        }),
        gate({ id: 'blocking', key: 'blocking', position: 0 }),
      ],
      evidence: [observation({ value: { type: 'percentage', value: '80' } })],
      evaluatedAt: '2026-08-26T12:00:00.000Z',
    });
    expect(evaluation.status).toBe('BLOCKED');
    expect(evaluation.gates.map(({ gateKey }) => gateKey)).toEqual([
      'blocking',
      'unknown',
      'warning',
    ]);
  });

  it('rejects duplicate, incompatible and out-of-range gates before evaluation', () => {
    const issues = validateReadinessGates([
      gate(),
      gate({
        id: 'duplicate',
        expected: { type: 'integer', value: -1 },
        metricVersion: '2.0.0',
      }),
    ]);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'duplicate_gate_key',
        'duplicate_gate_position',
        'unsupported_metric_version',
        'value_type_mismatch',
      ]),
    );
    expect(validateReadinessGates([])).toEqual([{ gateKey: null, code: 'empty_policy' }]);
  });
});

function gate(overrides: Partial<ReadinessGate> = {}): ReadinessGate {
  return {
    id: 'pass-rate',
    key: 'pass-rate',
    position: 0,
    metricKey: 'test.pass_rate',
    metricVersion: '1.0.0',
    dimensions: { testRunRole: 'required' },
    operator: 'GTE',
    expected: { type: 'percentage', value: '90' },
    impact: 'BLOCKING',
    missingEvidenceBehavior: 'UNKNOWN',
    staleEvidenceBehavior: 'UNKNOWN',
    minimumTrust: 'AUTHENTICATED',
    ...overrides,
  };
}

function observation(overrides: Partial<ReadinessEvidence> = {}): ReadinessEvidence {
  return {
    observationId: 'observation',
    producerId: 'producer',
    metricKey: 'test.pass_rate',
    metricVersion: '1.0.0',
    dimensions: { testRunRole: 'required' },
    state: 'AVAILABLE',
    value: { type: 'percentage', value: '90.000000000' },
    trust: 'AUTHENTICATED',
    observedAt: '2026-08-26T11:59:00.000Z',
    expiresAt: '2026-08-26T13:00:00.000Z',
    ...overrides,
  };
}
