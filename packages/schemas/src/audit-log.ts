import { z } from 'zod';

export const auditLogActionSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);

export const auditLogListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: auditLogActionSchema.optional(),
});

export const auditLogSchema = z.object({
  id: z.uuid(),
  actor: z.object({
    id: z.uuid(),
    type: z.enum(['user', 'api_token', 'system']),
  }),
  action: auditLogActionSchema,
  target: z.object({
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(200).nullable(),
  }),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const auditLogListResponseSchema = z.object({
  items: z.array(auditLogSchema),
  nextCursor: z.uuid().nullable(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;
