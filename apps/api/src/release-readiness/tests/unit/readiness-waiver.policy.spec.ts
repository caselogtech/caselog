import { describe, expect, it } from 'vitest';
import {
  effectiveReadinessDisposition,
  readinessWaiverStatus,
  validateReadinessWaiverTarget,
} from '../../domain/policies/readiness-waiver.policy';

const NOW = new Date('2026-08-27T12:00:00.000Z');

describe('readiness waiver policy', () => {
  it('keeps computed status unless an active waiver covers the complete exception', () => {
    const gates = [
      { id: 'failed', result: 'FAILED' as const },
      { id: 'warning', result: 'WARNING' as const },
    ];
    expect(
      effectiveReadinessDisposition({ computedStatus: 'BLOCKED', gates, waivers: [], at: NOW }),
    ).toBe('blocked');
    expect(
      effectiveReadinessDisposition({
        computedStatus: 'BLOCKED',
        gates,
        waivers: [gateWaiver('failed')],
        at: NOW,
      }),
    ).toBe('blocked');
    expect(
      effectiveReadinessDisposition({
        computedStatus: 'BLOCKED',
        gates,
        waivers: [gateWaiver('failed'), gateWaiver('warning')],
        at: NOW,
      }),
    ).toBe('approved_with_waiver');
    expect(
      effectiveReadinessDisposition({
        computedStatus: 'BLOCKED',
        gates,
        waivers: [decisionWaiver()],
        at: NOW,
      }),
    ).toBe('approved_with_waiver');
  });

  it('does not apply expired or revoked waivers and never changes a ready result', () => {
    const gate = { id: 'failed', result: 'FAILED' as const };
    expect(readinessWaiverStatus({ expiresAt: NOW, revokedAt: null }, NOW)).toBe('expired');
    expect(
      readinessWaiverStatus(
        { expiresAt: null, revokedAt: new Date('2026-08-27T11:00:00.000Z') },
        NOW,
      ),
    ).toBe('revoked');
    expect(
      effectiveReadinessDisposition({
        computedStatus: 'BLOCKED',
        gates: [gate],
        waivers: [{ ...gateWaiver('failed'), expiresAt: NOW }],
        at: NOW,
      }),
    ).toBe('blocked');
    expect(
      effectiveReadinessDisposition({
        computedStatus: 'READY',
        gates: [],
        waivers: [decisionWaiver()],
        at: NOW,
      }),
    ).toBe('ready');
  });

  it('rejects meaningless waiver targets', () => {
    expect(validateReadinessWaiverTarget({ decisionStatus: 'READY', gateResult: null })).toBe(
      'decision_already_ready',
    );
    expect(validateReadinessWaiverTarget({ decisionStatus: 'BLOCKED', gateResult: 'PASSED' })).toBe(
      'gate_already_passed',
    );
    expect(validateReadinessWaiverTarget({ decisionStatus: 'BLOCKED', gateResult: 'FAILED' })).toBe(
      null,
    );
  });
});

function decisionWaiver() {
  return {
    scope: 'DECISION' as const,
    gateEvaluationId: null,
    expiresAt: null,
    revokedAt: null,
  };
}

function gateWaiver(gateEvaluationId: string) {
  return {
    scope: 'GATE_EVALUATION' as const,
    gateEvaluationId,
    expiresAt: null,
    revokedAt: null,
  };
}
