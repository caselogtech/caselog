export function jobDatabaseUrl(): string {
  const explicitUrl = process.env.JOB_DATABASE_URL;
  if (explicitUrl) return explicitUrl;

  if (process.env.NODE_ENV !== 'production' && process.env.MIGRATION_DATABASE_URL) {
    return process.env.MIGRATION_DATABASE_URL;
  }

  throw new Error('JOB_DATABASE_URL is required');
}
