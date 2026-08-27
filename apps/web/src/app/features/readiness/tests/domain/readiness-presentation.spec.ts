import {
  explanationLabel,
  formatReadinessValue,
  gateAttentionOrder,
  gateImpactPresentation,
  gateResultPresentation,
  operatorSymbol,
  readinessDispositionPresentation,
  readinessProjectionPresentation,
  readinessStatusPresentation,
} from '../../domain/readiness-presentation';

describe('readiness presentation', () => {
  it('keeps computed status, disposition, and projection visually distinct', () => {
    expect(readinessStatusPresentation('blocked')).toMatchObject({ tone: 'danger' });
    expect(readinessDispositionPresentation('approved_with_waiver')).toMatchObject({
      tone: 'warning',
    });
    expect(readinessProjectionPresentation('stale')).toMatchObject({ tone: 'warning' });
    expect(readinessProjectionPresentation('failed')).toMatchObject({ tone: 'danger' });
  });

  it('orders attention gates before passed gates', () => {
    const results: GateEvaluation['result'][] = ['passed', 'warning', 'unknown', 'failed'];
    const ordered = results.sort(
      (left, right) => gateAttentionOrder(left) - gateAttentionOrder(right),
    );
    expect(ordered).toEqual(['failed', 'unknown', 'warning', 'passed']);
    expect(gateResultPresentation('failed').tone).toBe('danger');
    expect(gateImpactPresentation('blocking').tone).toBe('danger');
  });

  it('formats typed values, operators, and deterministic explanation codes', () => {
    expect(formatReadinessValue({ type: 'percentage', value: '97.8' })).toBe('97.8%');
    expect(formatReadinessValue({ type: 'integer', value: 3 })).toBe('3');
    expect(formatReadinessValue(null)).toBe('—');
    expect(operatorSymbol('gte')).toBe('≥');
    expect(explanationLabel('untrusted_evidence')).toBe(
      'readiness.gates.explanations.untrustedEvidence',
    );
  });
});
import type { GateEvaluation } from '@caselog/schemas';
