import { defineConfig } from 'vitest/config';
import path from 'node:path';

try { process.loadEnvFile('.env.local'); } catch { /* unit tests don't need it */ }

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 },
});
