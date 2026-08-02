import { z } from 'zod';

export const projectListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const projectSummarySchema = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(12),
  slug: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  caseCount: z.number().int().nonnegative(),
  activeRunCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectListResponseSchema = z.object({
  items: z.array(projectSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
