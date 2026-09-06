import { vi } from 'vitest';

// API suites must not consume each other's scheduled jobs. Tests explicitly drain
// the transport to exercise real registered workers without timing-dependent races.
vi.mock('pg-boss', async () => ({
  PgBoss: (await import('./manual-pg-boss.js')).ManualPgBoss,
}));
