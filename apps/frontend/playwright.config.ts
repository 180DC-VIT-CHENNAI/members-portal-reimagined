import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true, workers: 2,
  timeout: 30_000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4177', trace: 'retain-on-failure', screenshot: 'on' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'pnpm exec vite --config tests/vite.config.ts --host 127.0.0.1 --port 4177', url: 'http://127.0.0.1:4177/tests/fixtures/today.html', reuseExistingServer: false },
});
