import { z } from 'zod';

const environmentSchema = z.object({
  WEB_BASE_URL: z.url(),
  WORKSPACE_INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
});

export type InvitationConfig = {
  webBaseUrl: string;
  ttlDays: number;
};

export const INVITATION_CONFIG = Symbol('INVITATION_CONFIG');

export function createInvitationConfig(): InvitationConfig {
  const environment = environmentSchema.parse(process.env);
  return {
    webBaseUrl: environment.WEB_BASE_URL,
    ttlDays: environment.WORKSPACE_INVITATION_TTL_DAYS,
  };
}
