import { defineConfig, devices } from '@playwright/test';

// E2E preview/CI usa installFastGeminiStubs — não chama Gemini real (ver HANDOFF_AI.md)
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const isExternal = !!process.env.BASE_URL;
const desktopChrome = { ...devices['Desktop Chrome'] };
const vercelBypassHeaders = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : undefined;

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
    ...(vercelBypassHeaders ? { extraHTTPHeaders: vercelBypassHeaders } : {}),
  },

  projects: [
    {
      name: 'chromium',
      use: desktopChrome,
    },
    {
      name: 'critical-ux',
      use: desktopChrome,
      // Onda 1 E2E P0: 2ª investigação + stop/nova investigação (PR Gate IA 16/16)
      testMatch:
        /(scheffer-cnpj|blank-center|controlled-error|cofre-progressive|second-investigation|loading-smart-recovery).*\.spec\.ts/,
    },
    {
      name: 'p1-smoke',
      use: desktopChrome,
      testMatch: /smoke\..*\.spec\.ts/,
    },
    {
      // p2-cnpj-live: manual/workflow_dispatch only — npm run test:e2e:cnpj:live
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
