import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev -- --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    env: { VITE_GEMINI_API_KEY: 'e2e-local-test-key', VITE_GEMINI_MODEL: 'e2e-test-model' },
  },
});
