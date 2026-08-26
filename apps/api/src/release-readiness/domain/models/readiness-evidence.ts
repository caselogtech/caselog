import type {
  EvidenceTrust,
  ReadinessMetricKey,
  ReadinessValue,
  TestRunRole,
} from './readiness-policy';

export type ReadinessEvidence = {
  observationId: string;
  producerId: string;
  metricKey: ReadinessMetricKey;
  metricVersion: string;
  dimensions: { testRunRole: TestRunRole };
  state: 'AVAILABLE' | 'INCOMPLETE';
  value: ReadinessValue | null;
  trust: EvidenceTrust;
  observedAt: string;
  expiresAt: string | null;
};
