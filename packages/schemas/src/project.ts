import { z } from 'zod';

export const projectSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{1,11}$/);

export const projectStateSchema = z.enum(['active', 'archived']);

export const projectListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  state: projectStateSchema.default('active'),
});

export const projectSummarySchema = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(12),
  slug: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  state: projectStateSchema,
  caseCount: z.number().int().nonnegative(),
  activeRunCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectListResponseSchema = z.object({
  items: z.array(projectSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: projectKeySchema,
  slug: projectSlugSchema,
});

export const projectResponseSchema = z.object({ project: projectSummarySchema });
export const createProjectResponseSchema = projectResponseSchema;

export const updateProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const projectParamsSchema = z.object({ projectSlug: projectSlugSchema });

export const projectLifecycleResponseSchema = z.object({
  projectId: z.uuid(),
  state: projectStateSchema,
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type ProjectParams = z.infer<typeof projectParamsSchema>;
export type ProjectLifecycleResponse = z.infer<typeof projectLifecycleResponseSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
