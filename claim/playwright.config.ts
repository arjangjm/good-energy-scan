import { defineConfig, devices } from '@playwright/test';

try { process.loadEnvFile('.env.local'); } catch { /* set env another way */ }
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 15'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  workers: 1,
  // iPhone screen size and user agent, run in the Chrome that is already on this Mac.
  use: { ...iphone, baseURL: 'http://localhost:3000', channel: 'chrome' },
  webServer: { command: 'npx next dev -p 3000', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120000 },
});
