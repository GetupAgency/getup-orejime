import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npx http-server -p 4173 -c-1 .playwright-root',
    port: 4173,
    reuseExistingServer: true
  }
});
