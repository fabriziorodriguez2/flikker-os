import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:3001';
const API_URL = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start:dev --workspace=apps/api',
      url: `${API_URL}/`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3000',
      },
    },
    {
      command: 'npm run dev --workspace=apps/web -- --hostname 127.0.0.1 --port 3001',
      url: `${WEB_URL}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        API_URL,
      },
    },
  ],
});
