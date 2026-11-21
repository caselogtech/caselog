import { accessibilityReviewDetailsSchema, type QualityMetricDimensions } from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
export function accessibilityScopeKey(dimensions: QualityMetricDimensions): string {
  return JSON.stringify([
    dimensions.accessibilityStandard,
    [...(dimensions.pageUrls ?? [])].sort(),
    [...(dimensions.manualChecks ?? [])].sort(),
  ]);
}
export function accessibilityDetails(observation: EvidenceObservation) {
  const result = accessibilityReviewDetailsSchema.safeParse(observation.details);
  return result.success ? result.data : null;
}
