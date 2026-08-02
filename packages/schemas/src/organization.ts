import { z } from 'zod';

export const organizationIdSchema = z.uuid();

export type OrganizationId = z.infer<typeof organizationIdSchema>;
