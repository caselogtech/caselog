export type WaiverComputedStatus = 'READY' | 'AT_RISK' | 'BLOCKED' | 'UNKNOWN';
export type WaiverGateResult = 'PASSED' | 'WARNING' | 'FAILED' | 'UNKNOWN';
export type WaiverStatus = 'active' | 'expired' | 'revoked';
export type EffectiveReadinessDisposition =
  | 'ready'
  | 'at_risk'
  | 'blocked'
  | 'unknown'
  | 'approved_with_waiver';

export type WaiverLifecycle = {
  scope: 'DECISION' | 'GATE_EVALUATION';
  gateEvaluationId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export function readinessWaiverStatus(
  waiver: Pick<WaiverLifecycle, 'expiresAt' | 'revokedAt'>,
  at: Date,
): WaiverStatus {
  if (waiver.revokedAt) return 'revoked';
  if (waiver.expiresAt && waiver.expiresAt <= at) return 'expired';
  return 'active';
}

export function effectiveReadinessDisposition(input: {
  computedStatus: WaiverComputedStatus;
  gates: Array<{ id: string; result: WaiverGateResult }>;
  waivers: WaiverLifecycle[];
  at: Date;
}): EffectiveReadinessDisposition {
  const computed = input.computedStatus.toLowerCase() as Exclude<
    EffectiveReadinessDisposition,
    'approved_with_waiver'
  >;
  if (input.computedStatus === 'READY') return computed;

  const active = input.waivers.filter(
    (waiver) => readinessWaiverStatus(waiver, input.at) === 'active',
  );
  if (active.some(({ scope }) => scope === 'DECISION')) return 'approved_with_waiver';

  const unresolvedGates = input.gates.filter(({ result }) => result !== 'PASSED');
  if (
    unresolvedGates.length > 0 &&
    unresolvedGates.every(({ id }) =>
      active.some((waiver) => waiver.scope === 'GATE_EVALUATION' && waiver.gateEvaluationId === id),
    )
  ) {
    return 'approved_with_waiver';
  }
  return computed;
}

export function validateReadinessWaiverTarget(input: {
  decisionStatus: WaiverComputedStatus;
  gateResult: WaiverGateResult | null;
}): 'decision_already_ready' | 'gate_already_passed' | null {
  if (input.decisionStatus === 'READY') return 'decision_already_ready';
  if (input.gateResult === 'PASSED') return 'gate_already_passed';
  return null;
}
