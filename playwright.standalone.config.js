import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/standalone',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  outputDir: 'test-results/standalone',
  use: {
    offline: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 4180 --bind 127.0.0.1 --directory dist-standalone',
    url: 'http://127.0.0.1:4180/index.html',
    reuseExistingServer: false,
  },
});
