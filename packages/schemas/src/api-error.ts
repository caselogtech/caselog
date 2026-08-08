import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()),
    requestId: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
