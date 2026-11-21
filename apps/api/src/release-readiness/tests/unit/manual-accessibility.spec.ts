import { describe, expect, it } from 'vitest';
import { accessibilityReviewRequestSchema } from '@caselog/schemas';
import type { ReadinessGate } from '../../domain/models/readiness-policy';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';
import { evaluateReadiness } from '../../domain/policies/readiness-evaluator';
const dimensions = {
  testRunRole: 'required' as const,
  accessibilityStandard: 'WCAG 2.2 AA',
  pageUrls: ['https://example.com/'],
  manualChecks: ['keyboard_navigation' as const, 'screen_reader' as const],
};
const gate: ReadinessGate = {
  id: 'gate',
  key: 'a11y',
  position: 0,
  metricKey: 'accessibility.manual_review',
  metricVersion: '1.0.0',
  dimensions,
  operator: 'EQ',
  expected: { type: 'integer', value: 1 },
  impact: 'BLOCKING',
  missingEvidenceBehavior: 'BLOCK',
  staleEvidenceBehavior: 'BLOCK',
  minimumTrust: 'AUTHENTICATED',
};
const evidence: ReadinessEvidence = {
  observationId: 'review',
  producerId: 'human',
  producerKey: 'caselog.accessibility-reviews',
  metricKey: gate.metricKey,
  metricVersion: '1.0.0',
  dimensions,
  state: 'AVAILABLE',
  trust: 'AUTHENTICATED',
  value: { type: 'integer', value: 1 },
  observedAt: '2026-11-21T10:00:00.000Z',
  expiresAt: null,
};
const evaluate = (observation: ReadinessEvidence) =>
  evaluateReadiness({
    gates: [gate],
    evidence: [observation],
    evaluatedAt: '2026-11-21T11:00:00.000Z',
  });
describe('manual accessibility scope', () => {
  it('accepts a matching human review without an expiring CI profile', () =>
    expect(evaluate(evidence).status).toBe('READY'));
  it.each([
    { producerKey: 'external-ci' },
    { dimensions: { ...dimensions, accessibilityStandard: 'WCAG 2.1 AA' } },
    { dimensions: { ...dimensions, pageUrls: ['https://example.com/login'] } },
    { dimensions: { ...dimensions, manualChecks: ['keyboard_navigation' as const] } },
  ])('blocks mismatched scope or source: %j', (overrides) =>
    expect(evaluate({ ...evidence, ...overrides }).gates[0]?.diagnostic).toBe('MISSING'),
  );
  it('rejects OK without required checks but permits a documented Not OK', () => {
    const request = {
      dimensions,
      outcome: 'ok',
      tools: ['axe'],
      keyboardNavigation: 'passed',
      screenReader: 'not_checked',
      reportIds: ['11111111-1111-4111-8111-111111111111'],
      expectedObservationId: null,
    };
    expect(accessibilityReviewRequestSchema.safeParse(request).success).toBe(false);
    expect(
      accessibilityReviewRequestSchema.safeParse({ ...request, outcome: 'not_ok' }).success,
    ).toBe(true);
    expect(
      accessibilityReviewRequestSchema.safeParse({
        ...request,
        screenReader: 'passed',
        dimensions: { ...dimensions, pageUrls: ['javascript:alert(1)'] },
      }).success,
    ).toBe(false);
  });
});
