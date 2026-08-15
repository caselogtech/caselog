import { z } from 'zod';

const workspacePurgeEnvironmentSchema = z.object({
  WORKSPACE_PURGE_CRON: z.string().min(1).default('30 2 * * *'),
  WORKSPACE_PURGE_OBJECT_BATCH_SIZE: z.coerce.number().int().min(10).max(1_000).default(200),
  WORKSPACE_PURGE_MAX_BATCHES_PER_JOB: z.coerce.number().int().min(1).max(100).default(5),
});

export type WorkspacePurgeConfig = {
  cron: string;
  objectBatchSize: number;
  maxBatchesPerJob: number;
};

export const WORKSPACE_PURGE_CONFIG = Symbol('WORKSPACE_PURGE_CONFIG');

export function createWorkspacePurgeConfig(): WorkspacePurgeConfig {
  const environment = workspacePurgeEnvironmentSchema.parse(process.env);
  return {
    cron: environment.WORKSPACE_PURGE_CRON,
    objectBatchSize: environment.WORKSPACE_PURGE_OBJECT_BATCH_SIZE,
    maxBatchesPerJob: environment.WORKSPACE_PURGE_MAX_BATCHES_PER_JOB,
  };
}
