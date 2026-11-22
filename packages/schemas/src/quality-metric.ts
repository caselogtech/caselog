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
  'accessibility.manual_review',
  'gate.form_response',
]);
export const qualityMetricDimensionsSchema = z
  .object({
    gateId: z.uuid().optional(),
    testRunRole: z.enum(['required', 'informational']),
    minimumPriority: testCasePrioritySchema.optional(),
    accessibilityStandard: z.string().trim().min(1).max(120).optional(),
    manualChecks: z
      .array(z.enum(['keyboard_navigation', 'screen_reader']))
      .max(2)
      .refine(
        (checks) =>
          new Set(checks).size === checks.length && checks.join() === [...checks].sort().join(),
        { message: 'Manual checks must be unique and sorted' },
      )
      .optional(),
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
  'gate.form_response': { version: '1.0.0', valueType: 'integer' },
  'accessibility.manual_review': { version: '1.0.0', valueType: 'integer' },
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
  if (metric === 'gate.form_response') {
    if (
      dimensions.testRunRole !== 'required' ||
      Object.keys(dimensions).some((key) => !['testRunRole', 'gateId'].includes(key))
    )
      context.addIssue({
        code: 'custom',
        path: ['dimensions'],
        message: 'Gate responses accept only the required role and gate identity',
      });
    return;
  }
  if (dimensions.gateId)
    context.addIssue({
      code: 'custom',
      path: ['dimensions', 'gateId'],
      message: 'Gate identity is reserved for form responses',
    });
  if (metric === 'accessibility.manual_review') {
    if (
      !dimensions.accessibilityStandard ||
      !dimensions.pageUrls ||
      dimensions.pageUrls.some((url) => !/^https?:\/\//i.test(url)) ||
      !dimensions.manualChecks ||
      dimensions.testRunRole !== 'required' ||
      dimensions.minimumPriority ||
      dimensions.profile ||
      dimensions.toolVersion ||
      dimensions.device ||
      dimensions.runsPerPage
    ) {
      context.addIssue({
        code: 'custom',
        path: ['dimensions'],
        message: 'Accessibility reviews require a standard, pages and manual checks only',
      });
    }
    return;
  }
  if (dimensions.accessibilityStandard || dimensions.manualChecks) {
    context.addIssue({
      code: 'custom',
      path: ['dimensions'],
      message: 'Accessibility requirements belong to manual reviews',
    });
  }
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
