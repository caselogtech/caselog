import { emailSchema } from '@caselog/schemas';
import { z } from 'zod';

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  emailSchema.optional(),
);

const staffEnvironmentSchema = z.object({
  CASELOG_STAFF_BOOTSTRAP_EMAIL: optionalEmail,
  CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS: z.coerce.number().int().min(1).max(168).default(168),
});

export type StaffConfig = {
  bootstrapEmail?: string;
  bootstrapAccessHours: number;
};

export const STAFF_CONFIG = Symbol('STAFF_CONFIG');

export function createStaffConfig(): StaffConfig {
  const environment = staffEnvironmentSchema.parse(process.env);
  return {
    bootstrapEmail: environment.CASELOG_STAFF_BOOTSTRAP_EMAIL,
    bootstrapAccessHours: environment.CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS,
  };
}
