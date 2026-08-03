import { z } from 'zod';

const mailEnvironmentSchema = z.object({
  MAIL_HOST: z.string().min(1),
  MAIL_PORT: z.coerce.number().int().positive(),
  MAIL_FROM: z.string().min(1),
  MAIL_SECURE: z.enum(['true', 'false']).default('false'),
  MAIL_USER: z.string().min(1).optional(),
  MAIL_PASSWORD: z.string().min(1).optional(),
});

export type MailConfig = {
  host: string;
  port: number;
  from: string;
  secure: boolean;
  user?: string;
  password?: string;
};

export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

export function createMailConfig(): MailConfig {
  const environment = mailEnvironmentSchema.parse(process.env);
  return {
    host: environment.MAIL_HOST,
    port: environment.MAIL_PORT,
    from: environment.MAIL_FROM,
    secure: environment.MAIL_SECURE === 'true',
    user: environment.MAIL_USER,
    password: environment.MAIL_PASSWORD,
  };
}
