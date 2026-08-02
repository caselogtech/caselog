import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export function loadLocalEnvironment(): void {
  loadDotenv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
}
