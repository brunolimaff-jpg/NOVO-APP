import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const isExternal = !!process.env.BASE_URL;
const desktopChrome = { ...devices['Desktop Chrome'] };

export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Mantemos em 1 para garantir a ordem em testes de fluxo de chat
  reporter: 'html',
  timeout: 180_000, // 3 min — investigação Gemini pode demorar
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: desktopChrome,
    },
    {
      name: 'p0-critical',
      use: desktopChrome,
      testMatch: /(scheffer-cnpj|blank-center|controlled-error|cofre-progressive).*\.spec\.ts/,
    },
    {
      name: 'p1-smoke',
      use: desktopChrome,
      testMatch: /smoke\..*\.spec\.ts/,
    },
    {
      name: 'p2-cnpj-live',
      use: desktopChrome,
      testMatch: /cnpj-investigation-flow\.spec\.ts/,
    },
  ],

  // Pula dev server quando aponta pra URL externa (preview Vercel)
  ...(isExternal
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
});
