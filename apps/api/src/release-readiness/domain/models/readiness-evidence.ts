import type { QualityMetricDimensions } from '@caselog/schemas';
import type { EvidenceTrust, ReadinessMetricKey, ReadinessValue } from './readiness-policy';

export type ReadinessEvidence = {
  observationId: string;
  producerId: string;
  metricKey: ReadinessMetricKey;
  metricVersion: string;
  dimensions: QualityMetricDimensions;
  producerKey?: string;
  state: 'AVAILABLE' | 'INCOMPLETE';
  value: ReadinessValue | null;
  trust: EvidenceTrust;
  observedAt: string;
  expiresAt: string | null;
};
