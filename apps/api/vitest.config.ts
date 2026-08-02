import { defineConfig } from 'vitest/config';
import { loadLocalEnvironment } from './src/core/config/environment';

loadLocalEnvironment();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
