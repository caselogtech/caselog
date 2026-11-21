import { z } from 'zod';
import { projectSlugSchema } from './project.js';
import { qualityMetricDimensionsSchema, validateMetricDimensions } from './quality-metric.js';

export const accessibilityReviewParamsSchema = z.object({
  projectSlug: projectSlugSchema,
  candidateId: z.uuid(),
});
export const accessibilityReviewRequestSchema = z
  .object({
    dimensions: qualityMetricDimensionsSchema,
    outcome: z.enum(['ok', 'not_ok']),
    tools: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(10)
      .refine((tools) => new Set(tools).size === tools.length, { message: 'Tools must be unique' }),
    keyboardNavigation: z.enum(['passed', 'failed', 'not_checked']),
    screenReader: z.enum(['passed', 'failed', 'not_checked']),
    reportIds: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length),
    notes: z.string().trim().max(2000).default(''),
    expectedObservationId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((review, context) => {
    const dimensions = review.dimensions;
    validateMetricDimensions('accessibility.manual_review', dimensions, context);
    if (review.outcome === 'ok') {
      for (const check of dimensions.manualChecks ?? []) {
        const field = check === 'keyboard_navigation' ? 'keyboardNavigation' : 'screenReader';
        if (review[field] !== 'passed')
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Required manual checks must pass before marking OK',
          });
      }
    }
  });
export type AccessibilityReviewRequest = z.infer<typeof accessibilityReviewRequestSchema>;

export const accessibilityReviewDetailsSchema = z.object({
  outcome: z.enum(['ok', 'not_ok']),
  actorId: z.uuid(),
  reviewerName: z.string().trim().min(1).max(120).optional(),
  tools: z.array(z.string().max(80)).max(10),
  keyboardNavigation: z.enum(['passed', 'failed', 'not_checked']),
  screenReader: z.enum(['passed', 'failed', 'not_checked']),
  reportIds: z.array(z.uuid()).min(1).max(10),
  reportNames: z.array(z.string().max(255)).min(1).max(10),
  notes: z.string().max(2000),
});
