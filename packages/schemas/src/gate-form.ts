import { z } from 'zod';

const fieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,49}$/)
  .refine((key) => !['constructor', 'prototype'].includes(key), {
    message: 'This key is reserved',
  });
const comparisonSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
export const gateFormFieldSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(''),
    type: z.enum(['text', 'textarea', 'number', 'checkbox', 'select', 'url', 'files']),
    required: z.boolean(),
    options: z
      .array(z.object({ key: fieldKeySchema, label: z.string().trim().min(1).max(120) }).strict())
      .max(30)
      .default([]),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (
      (field.type === 'select' && field.options.length < 1) ||
      (field.type !== 'select' && field.options.length > 0) ||
      new Set(field.options.map(({ key }) => key)).size !== field.options.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Select fields require unique options; other fields cannot have options',
      });
  });
export const gateFormCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checkbox'), fieldKey: fieldKeySchema }).strict(),
  z
    .object({
      type: z.literal('number'),
      fieldKey: fieldKeySchema,
      operator: comparisonSchema,
      expected: z.number().finite().min(-1e9).max(1e9),
    })
    .strict(),
  z
    .object({ type: z.literal('select'), fieldKey: fieldKeySchema, expected: fieldKeySchema })
    .strict(),
  z
    .object({
      type: z.literal('test_results'),
      metricKey: z.enum(['test.pass_rate', 'test.completion_rate', 'test.failed_count']),
      testRunRole: z.enum(['required', 'informational']),
      minimumPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      operator: comparisonSchema,
      expected: z.number().finite().min(0).max(1e9),
    })
    .strict(),
]);
export const gateFormDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    fields: z.array(gateFormFieldSchema).max(30),
    criteria: z.array(gateFormCriterionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((form, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(form)).byteLength > 120000)
      ctx.addIssue({ code: 'custom', message: 'Form definition exceeds 120000 UTF-8 bytes' });
    if (new Set(form.fields.map(({ key }) => key)).size !== form.fields.length)
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Field keys must be unique' });
    form.criteria.forEach((criterion, index) => {
      if (criterion.type === 'test_results') {
        if (
          (criterion.metricKey !== 'test.failed_count' && criterion.expected > 100) ||
          (criterion.metricKey === 'test.failed_count' &&
            !Number.isSafeInteger(criterion.expected)) ||
          Math.round(criterion.expected * 1e9) / 1e9 !== criterion.expected
        )
          ctx.addIssue({
            code: 'custom',
            path: ['criteria', index, 'expected'],
            message: 'Use a valid count or percentage with at most nine decimal places',
          });
        return;
      }
      const field = form.fields.find(({ key }) => key === criterion.fieldKey);
      if (
        !field ||
        field.type !== criterion.type ||
        (criterion.type === 'select' &&
          !field.options.some(({ key }) => key === criterion.expected))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['criteria', index],
          message: 'A condition must reference a field of the matching type and an existing option',
        });
    });
  });
export const gateFormAnswersSchema = z
  .record(
    fieldKeySchema,
    z.union([
      z.string().max(4000),
      z.number().finite().min(-1e9).max(1e9),
      z.boolean(),
      z.array(z.uuid()).max(10),
    ]),
  )
  .refine((values) => Object.keys(values).length <= 30 && JSON.stringify(values).length <= 64000, {
    message: 'A response supports up to 30 fields and 64000 characters',
  });
export const gateFormResponseRequestSchema = z
  .object({
    values: gateFormAnswersSchema,
    expectedObservationId: z.uuid().nullable(),
  })
  .strict();
export const gateFormResponseDetailsSchema = z
  .object({
    kind: z.literal('gate_form_response'),
    actorId: z.uuid(),
    reviewerName: z.string().trim().min(1).max(120),
    values: gateFormAnswersSchema,
    reports: z.array(z.object({ id: z.uuid(), fileName: z.string().max(255) }).strict()).max(30),
  })
  .strict();
export const gateFormCriterionResultSchema = z.object({
  key: z.string().max(80),
  label: z.string().max(120),
  result: z.enum(['passed', 'failed', 'warning', 'unknown']),
  diagnostic: z.enum(['none', 'missing', 'incomplete', 'stale', 'untrusted']),
  observationId: z.uuid().nullable(),
  actual: z.string().max(4000).nullable(),
  expected: z.string().max(120),
});
export type GateFormDefinition = z.infer<typeof gateFormDefinitionSchema>;
export type GateFormField = z.infer<typeof gateFormFieldSchema>;
export type GateFormCriterion = z.infer<typeof gateFormCriterionSchema>;
export type GateFormAnswers = z.infer<typeof gateFormAnswersSchema>;
export type GateFormResponseRequest = z.infer<typeof gateFormResponseRequestSchema>;
export type GateFormResponseDetails = z.infer<typeof gateFormResponseDetailsSchema>;
export type GateFormCriterionResult = z.infer<typeof gateFormCriterionResultSchema>;

/** Validates a candidate response against its immutable, server-resolved gate definition. */
export function validateGateFormAnswers(
  form: GateFormDefinition,
  values: GateFormAnswers,
): string[] {
  const invalid = Object.keys(values).filter(
    (key) => !form.fields.some((field) => field.key === key),
  );
  for (const field of form.fields) {
    const value = Object.hasOwn(values, field.key) ? values[field.key] : undefined;
    const empty =
      value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required) invalid.push(field.key);
      continue;
    }
    const valid =
      field.type === 'number'
        ? typeof value === 'number'
        : field.type === 'checkbox'
          ? typeof value === 'boolean'
          : field.type === 'files'
            ? Array.isArray(value) && new Set(value).size === value.length
            : field.type === 'select'
              ? typeof value === 'string' && field.options.some(({ key }) => key === value)
              : field.type === 'url'
                ? typeof value === 'string' &&
                  /^https?:\/\//i.test(value) &&
                  z.url().safeParse(value).success
                : typeof value === 'string' && value.trim().length > 0;
    if (!valid) invalid.push(field.key);
  }
  return [...new Set(invalid)];
}
