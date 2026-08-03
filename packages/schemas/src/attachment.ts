import { z } from 'zod';
import { testResultParamsSchema, testRunItemParamsSchema } from './test-run.js';

export const attachmentContentTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

export const createUploadSessionRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => !/[\\/\0]/.test(value), { message: 'File name must not contain a path' }),
  contentType: attachmentContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(104_857_600),
  checksumSha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase()),
  stepPosition: z.number().int().min(0).max(199).optional(),
});

export const createUploadSessionParamsSchema = testRunItemParamsSchema;

export const attachmentDownloadParamsSchema = testResultParamsSchema.extend({
  attachmentId: z.uuid(),
});

export const createUploadSessionResponseSchema = z.object({
  upload: z.object({
    id: z.uuid(),
    method: z.literal('PUT'),
    url: z.url(),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
});

export const attachmentDownloadResponseSchema = z.object({
  download: z.object({
    url: z.url(),
    expiresAt: z.iso.datetime(),
  }),
});

export type AttachmentContentType = z.infer<typeof attachmentContentTypeSchema>;
export type CreateUploadSessionRequest = z.infer<typeof createUploadSessionRequestSchema>;
export type CreateUploadSessionParams = z.infer<typeof createUploadSessionParamsSchema>;
export type CreateUploadSessionResponse = z.infer<typeof createUploadSessionResponseSchema>;
export type AttachmentDownloadParams = z.infer<typeof attachmentDownloadParamsSchema>;
export type AttachmentDownloadResponse = z.infer<typeof attachmentDownloadResponseSchema>;
