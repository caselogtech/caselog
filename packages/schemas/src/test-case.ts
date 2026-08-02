import { z } from 'zod';

export const projectSlugSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const testCaseListParamsSchema = z.object({
  projectSlug: projectSlugSchema,
});

export const testCaseListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(1).max(200).optional(),
  sectionId: z.uuid().optional(),
  state: z.enum(['active', 'archived']).default('active'),
});

export const testCaseTemplateSchema = z.enum(['steps', 'text', 'exploratory', 'bdd']);

export const testCaseSummarySchema = z.object({
  id: z.uuid(),
  caseNumber: z.string().regex(/^[1-9]\d*$/),
  title: z.string().min(1).max(500),
  template: testCaseTemplateSchema,
  automationId: z.string().nullable(),
  section: z.object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
  }),
  updatedAt: z.iso.datetime(),
});

export const testCaseListResponseSchema = z.object({
  project: z.object({
    id: z.uuid(),
    key: z.string().min(1).max(12),
    slug: projectSlugSchema,
    name: z.string().min(1).max(120),
  }),
  items: z.array(testCaseSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const projectStructureResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  suites: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1).max(120),
      position: z.number().int(),
      sections: z.array(
        z.object({
          id: z.uuid(),
          parentId: z.uuid().nullable(),
          name: z.string().min(1).max(120),
          depth: z.number().int().nonnegative(),
          position: z.number().int(),
        }),
      ),
    }),
  ),
});

const createCaseBase = {
  title: z.string().trim().min(1).max(500),
  sectionId: z.uuid(),
  automationId: z
    .union([z.string().trim().min(1).max(500), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
  preconditions: z.string().trim().max(50_000).optional(),
  expectedResult: z.string().trim().max(50_000).optional(),
};

const testCaseContentSchemas = {
  steps: z.object({
    steps: z
      .array(
        z.object({
          action: z.string().trim().min(1).max(10_000),
          expected: z.string().trim().max(10_000).optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  text: z.object({ text: z.string().trim().min(1).max(50_000) }),
  exploratory: z.object({ charter: z.string().trim().min(1).max(50_000) }),
  bdd: z.object({ gherkin: z.string().trim().min(1).max(50_000) }),
} as const;

export const testCaseContentSchema = z.union([
  testCaseContentSchemas.steps,
  testCaseContentSchemas.text,
  testCaseContentSchemas.exploratory,
  testCaseContentSchemas.bdd,
]);

function validateTemplateContent(
  request: { template: TestCaseTemplate; content: unknown },
  context: z.RefinementCtx,
): void {
  const result = testCaseContentSchemas[request.template].safeParse(request.content);
  if (!result.success) {
    context.addIssue({
      code: 'custom',
      path: ['content'],
      message: `Content must match the ${request.template} template`,
    });
  }
}

export const createTestCaseRequestSchema = z
  .object({
    ...createCaseBase,
    template: testCaseTemplateSchema,
    content: testCaseContentSchema,
  })
  .superRefine(validateTemplateContent);

export const createTestCaseResponseSchema = z.object({
  testCase: testCaseSummarySchema,
  version: z.object({ id: z.uuid(), version: z.literal(1) }),
});

export const testCaseDetailParamsSchema = testCaseListParamsSchema.extend({
  caseId: z.uuid(),
});

export const testCaseVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(500),
  template: testCaseTemplateSchema,
  preconditions: z.string().nullable(),
  expectedResult: z.string().nullable(),
  content: testCaseContentSchema,
  createdAt: z.iso.datetime(),
  createdBy: z
    .object({
      id: z.uuid(),
      displayName: z.string().min(1).max(120),
    })
    .nullable(),
});

export const testCaseDetailResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  testCase: z.object({
    id: z.uuid(),
    caseNumber: z.string().regex(/^[1-9]\d*$/),
    automationId: z.string().nullable(),
    section: z.object({
      id: z.uuid(),
      name: z.string().min(1).max(120),
      suiteId: z.uuid(),
      suiteName: z.string().min(1).max(120),
    }),
    currentVersion: testCaseVersionSchema,
    versions: z.array(testCaseVersionSchema.omit({ content: true })).min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
});

export const updateTestCaseRequestSchema = z
  .object({
    ...createCaseBase,
    baseVersion: z.number().int().positive(),
    template: testCaseTemplateSchema,
    content: testCaseContentSchema,
  })
  .superRefine(validateTemplateContent);

export const updateTestCaseResponseSchema = z.object({
  testCase: testCaseSummarySchema,
  version: z.object({ id: z.uuid(), version: z.number().int().min(2) }),
});

export const testCaseVersionParamsSchema = testCaseDetailParamsSchema.extend({
  versionId: z.uuid(),
});

export const restoreTestCaseVersionRequestSchema = z.object({
  baseVersion: z.number().int().positive(),
});

export const testCaseLifecycleResponseSchema = z.object({
  testCaseId: z.uuid(),
  state: z.enum(['active', 'archived']),
});

export type TestCaseListParams = z.infer<typeof testCaseListParamsSchema>;
export type TestCaseListQuery = z.infer<typeof testCaseListQuerySchema>;
export type TestCaseTemplate = z.infer<typeof testCaseTemplateSchema>;
export type TestCaseSummary = z.infer<typeof testCaseSummarySchema>;
export type TestCaseListResponse = z.infer<typeof testCaseListResponseSchema>;
export type ProjectStructureResponse = z.infer<typeof projectStructureResponseSchema>;
export type CreateTestCaseRequest = z.infer<typeof createTestCaseRequestSchema>;
export type CreateTestCaseResponse = z.infer<typeof createTestCaseResponseSchema>;
export type TestCaseDetailParams = z.infer<typeof testCaseDetailParamsSchema>;
export type TestCaseVersion = z.infer<typeof testCaseVersionSchema>;
export type TestCaseDetailResponse = z.infer<typeof testCaseDetailResponseSchema>;
export type UpdateTestCaseRequest = z.infer<typeof updateTestCaseRequestSchema>;
export type UpdateTestCaseResponse = z.infer<typeof updateTestCaseResponseSchema>;
export type TestCaseVersionParams = z.infer<typeof testCaseVersionParamsSchema>;
export type RestoreTestCaseVersionRequest = z.infer<typeof restoreTestCaseVersionRequestSchema>;
export type TestCaseLifecycleResponse = z.infer<typeof testCaseLifecycleResponseSchema>;
