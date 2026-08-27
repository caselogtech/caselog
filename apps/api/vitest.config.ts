import { defineConfig } from 'vitest/config';
import { loadLocalEnvironment } from './src/core/config/environment';

loadLocalEnvironment();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Each integration worker owns Nest and Prisma clients. Keep the aggregate
    // pool below PostgreSQL's connection ceiling on developer and CI machines.
    maxWorkers: 4,
  },
});
