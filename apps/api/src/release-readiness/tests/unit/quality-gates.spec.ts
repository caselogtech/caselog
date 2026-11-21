import { describe, expect, it } from 'vitest';
import { evidenceIngestRequestSchema } from '@caselog/schemas/evidence';
import { readinessGateInputSchema } from '@caselog/schemas/readiness';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';
import type { ReadinessGate } from '../../domain/models/readiness-policy';
import { evaluateReadiness } from '../../domain/policies/readiness-evaluator';

const dimensions = {
  testRunRole: 'required' as const,
  profile: 'production-mobile-v1',
  pageUrls: ['https://example.com/checkout'],
  toolVersion: 'pinned-ci-version',
  device: 'mobile' as const,
  runsPerPage: 3,
};
const gate: ReadinessGate = {
  id: 'gate',
  key: 'performance',
  position: 0,
  metricKey: 'performance.lighthouse_score',
  metricVersion: '1.0.0',
  producerKey: 'trusted-ci',
  dimensions,
  operator: 'GTE',
  expected: { type: 'percentage', value: '90' },
  impact: 'BLOCKING',
  missingEvidenceBehavior: 'BLOCK',
  staleEvidenceBehavior: 'BLOCK',
  minimumTrust: 'AUTHENTICATED',
};
const evidence: ReadinessEvidence = {
  observationId: 'report',
  producerId: 'producer',
  producerKey: 'trusted-ci',
  metricKey: gate.metricKey,
  metricVersion: '1.0.0',
  dimensions,
  state: 'AVAILABLE',
  value: { type: 'percentage', value: '92' },
  trust: 'AUTHENTICATED',
  observedAt: '2026-11-21T10:00:00.000Z',
  expiresAt: '2026-11-22T10:00:00.000Z',
};
const evaluate = (observation: ReadinessEvidence) =>
  evaluateReadiness({
    gates: [gate],
    evidence: [observation],
    evaluatedAt: '2026-11-21T11:00:00.000Z',
  });

describe('external quality gates', () => {
  it('passes matching evidence and blocks a score below the threshold', () => {
    expect(evaluate(evidence).status).toBe('READY');
    expect(
      evaluate({ ...evidence, value: { type: 'percentage', value: '89.999999999' } }).status,
    ).toBe('BLOCKED');
  });
  it.each([
    { producerKey: 'another-ci' },
    { dimensions: { ...dimensions, profile: 'another-profile' } },
    { dimensions: { ...dimensions, pageUrls: ['https://example.com/'] } },
    { dimensions: { ...dimensions, device: 'desktop' as const } },
    { dimensions: { ...dimensions, toolVersion: 'changed' } },
    { dimensions: { ...dimensions, runsPerPage: 5 } },
  ])('does not accept mismatched source or measurement context: %j', (overrides) => {
    expect(evaluate({ ...evidence, ...overrides }).gates[0]).toMatchObject({
      diagnostic: 'MISSING',
      result: 'FAILED',
    });
  });
  it.each([
    { expiresAt: '2026-11-21T10:30:00.000Z' },
    { trust: 'UNVERIFIED' as const },
    { state: 'INCOMPLETE' as const, value: null },
  ])('blocks stale, untrusted or incomplete reports: %j', (overrides) =>
    expect(evaluate({ ...evidence, ...overrides }).status).toBe('BLOCKED'),
  );

  const request = {
    candidateId: '11111111-1111-4111-8111-111111111111',
    metricKey: gate.metricKey,
    metricVersion: '1.0.0',
    dimensions,
    state: 'available',
    value: { type: 'percentage', value: '92' },
    observedAt: evidence.observedAt,
    expiresAt: evidence.expiresAt,
    source: { type: 'ci', id: 'job', revision: '1', url: 'https://example.com/reports/1' },
    details: { performanceSamples: [90, 92, 95] },
  };
  it('validates per-page medians, report links and complete measurement metadata', () => {
    expect(evidenceIngestRequestSchema.safeParse(request).success).toBe(true);
    for (const invalid of [
      { value: { type: 'percentage', value: '95' } },
      { details: { performanceSamples: [99] } },
      { dimensions: { ...dimensions, device: undefined } },
      { source: { ...request.source, url: null } },
    ])
      expect(evidenceIngestRequestSchema.safeParse({ ...request, ...invalid }).success).toBe(false);
  });
  it('requires each configured page, aggregating the minimum median rather than the best page', () => {
    const report = {
      ...request,
      dimensions: {
        ...dimensions,
        pageUrls: ['https://example.com/', 'https://example.com/checkout'],
      },
      details: { performanceSamples: [99, 99, 99, 85, 86, 87] },
      value: { type: 'percentage', value: '86' },
    };
    expect(evidenceIngestRequestSchema.safeParse(report).success).toBe(true);
    expect(
      evidenceIngestRequestSchema.safeParse({
        ...report,
        value: { type: 'percentage', value: '99' },
      }).success,
    ).toBe(false);
  });
  it('requires a separate passed manual review and pins an external source', () => {
    const input = {
      key: 'review',
      metricKey: 'accessibility.wcag22_aa_manual_review',
      metricVersion: '1.0.0',
      dimensions: {
        testRunRole: 'required',
        profile: 'wcag22-aa-v1',
        pageUrls: dimensions.pageUrls,
        toolVersion: 'review-checklist-v1',
      },
      producerKey: 'reviewer',
      operator: 'eq',
      expected: { type: 'integer', value: 1 },
      impact: 'blocking',
    };
    expect(readinessGateInputSchema.safeParse(input).success).toBe(true);
    expect(readinessGateInputSchema.safeParse({ ...input, producerKey: undefined }).success).toBe(
      false,
    );
    expect(
      readinessGateInputSchema.safeParse({ ...input, expected: { type: 'integer', value: 0 } })
        .success,
    ).toBe(false);
  });
});
