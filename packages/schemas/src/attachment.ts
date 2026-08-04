import { z } from 'zod';
import { testCaseVersionParamsSchema } from './test-case.js';
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

export const createCaseAttachmentUploadSessionRequestSchema = createUploadSessionRequestSchema.omit(
  {
    stepPosition: true,
  },
);
export const caseAttachmentParamsSchema = testCaseVersionParamsSchema;
export const caseAttachmentItemParamsSchema = caseAttachmentParamsSchema.extend({
  attachmentId: z.uuid(),
});
export const completeCaseAttachmentRequestSchema = z.object({ uploadId: z.uuid() });
export const caseAttachmentListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const caseAttachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string().min(1).max(255),
  contentType: attachmentContentTypeSchema,
  sizeBytes: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime(),
});
export const caseAttachmentListResponseSchema = z.object({
  items: z.array(caseAttachmentSchema),
  nextCursor: z.uuid().nullable(),
});
export const caseAttachmentResponseSchema = z.object({ attachment: caseAttachmentSchema });

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
export type CreateCaseAttachmentUploadSessionRequest = z.infer<
  typeof createCaseAttachmentUploadSessionRequestSchema
>;
export type CaseAttachmentParams = z.infer<typeof caseAttachmentParamsSchema>;
export type CaseAttachmentItemParams = z.infer<typeof caseAttachmentItemParamsSchema>;
export type CompleteCaseAttachmentRequest = z.infer<typeof completeCaseAttachmentRequestSchema>;
export type CaseAttachmentListQuery = z.infer<typeof caseAttachmentListQuerySchema>;
export type CaseAttachment = z.infer<typeof caseAttachmentSchema>;
export type CaseAttachmentListResponse = z.infer<typeof caseAttachmentListResponseSchema>;
export type CaseAttachmentResponse = z.infer<typeof caseAttachmentResponseSchema>;
