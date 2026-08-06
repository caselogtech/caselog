import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  INTEGRATION_ALLOW_PRIVATE_NETWORKS: z.enum(['true', 'false']).optional(),
  INTEGRATION_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  INTEGRATION_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10_000_000)
    .default(2_000_000),
  WEB_BASE_URL: z.url(),
  ISSUE_TRACKER_SYNC_CRON: z.string().min(1).default('*/5 * * * *'),
});

export type IssueTrackerConfig = {
  allowPrivateNetworks: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
  webBaseUrl: string;
  syncCron: string;
};

export const ISSUE_TRACKER_CONFIG = Symbol('ISSUE_TRACKER_CONFIG');

export function createIssueTrackerConfig(): IssueTrackerConfig {
  const environment = environmentSchema.parse(process.env);
  return {
    allowPrivateNetworks:
      environment.INTEGRATION_ALLOW_PRIVATE_NETWORKS === 'true' ||
      (environment.INTEGRATION_ALLOW_PRIVATE_NETWORKS === undefined &&
        environment.NODE_ENV !== 'production'),
    timeoutMs: environment.INTEGRATION_HTTP_TIMEOUT_MS,
    maxResponseBytes: environment.INTEGRATION_MAX_RESPONSE_BYTES,
    webBaseUrl: environment.WEB_BASE_URL.replace(/\/$/, ''),
    syncCron: environment.ISSUE_TRACKER_SYNC_CRON,
  };
}
