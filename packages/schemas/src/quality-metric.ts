import { z } from 'zod';

export const testCasePrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type TestCasePriority = z.infer<typeof testCasePrioritySchema>;

export const qualityMetricKeySchema = z.enum([
  'test.pass_rate',
  'test.completion_rate',
  'test.failed_count',
  'accessibility.wcag22_aa_violations',
  'accessibility.wcag22_aa_manual_review',
  'performance.lighthouse_score',
]);
export const qualityMetricDimensionsSchema = z
  .object({
    testRunRole: z.enum(['required', 'informational']),
    minimumPriority: testCasePrioritySchema.optional(),
    profile: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)
      .optional(),
    pageUrls: z
      .array(z.url().max(2048))
      .min(1)
      .max(50)
      .refine(
        (urls) =>
          new Set(urls).size === urls.length &&
          urls.every((url, index) => index === 0 || (urls[index - 1] ?? '') < url),
        { message: 'Page URLs must be unique and sorted' },
      )
      .optional(),
    toolVersion: z.string().trim().min(1).max(80).optional(),
    device: z.enum(['mobile', 'desktop']).optional(),
    runsPerPage: z.number().int().min(3).max(10).optional(),
  })
  .strict();
export const QUALITY_METRIC_DEFINITIONS = {
  'test.pass_rate': { version: '1.0.0', valueType: 'percentage' },
  'test.completion_rate': { version: '1.0.0', valueType: 'percentage' },
  'test.failed_count': { version: '1.0.0', valueType: 'integer' },
  'accessibility.wcag22_aa_violations': { version: '1.0.0', valueType: 'integer' },
  'accessibility.wcag22_aa_manual_review': { version: '1.0.0', valueType: 'integer' },
  'performance.lighthouse_score': { version: '1.0.0', valueType: 'percentage' },
} as const;
export type QualityMetricDimensions = z.infer<typeof qualityMetricDimensionsSchema>;

export function validateMetricDimensions(
  metric: z.infer<typeof qualityMetricKeySchema>,
  dimensions: QualityMetricDimensions,
  context: z.RefinementCtx,
): void {
  const native = metric.startsWith('test.');
  if (
    (native &&
      (dimensions.profile ||
        dimensions.pageUrls ||
        dimensions.device ||
        dimensions.toolVersion ||
        dimensions.runsPerPage)) ||
    (!native &&
      (!dimensions.profile ||
        !dimensions.pageUrls ||
        !dimensions.toolVersion ||
        dimensions.minimumPriority ||
        dimensions.testRunRole !== 'required')) ||
    (metric === 'performance.lighthouse_score' &&
      (!dimensions.device || !dimensions.runsPerPage)) ||
    (metric.startsWith('accessibility.') && (dimensions.device || dimensions.runsPerPage))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['dimensions'],
      message:
        'Test metrics accept a priority scope; external metrics require a profile and the required role',
    });
  }
}
