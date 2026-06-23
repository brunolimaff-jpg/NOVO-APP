/**
 * LiteLLM live — 5 waterfalls em paralelo no preview Vercel.
 * SEM stubs em /api/gemini — chama LiteLLM/Gemini real conforme env do preview.
 *
 * Uso:
 *   BASE_URL=https://...preview.vercel.app \
 *   E2E_OPERATOR_EMAIL=bruno@senior.com.br \
 *   npx playwright test tests-e2e/litellm-live-parallel.spec.ts --workers=5
 */
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { installCNPJStub } from './helpers/cnpj-stub';
import {
  completeOnboarding,
  dismissDuplicateDossierModal,
  dismissMigrationNotice,
  e2eCompanyName,
  preventMigrationNotice,
} from './helpers/onboarding';

const SCHEFFER_CNPJ = '04.733.767/0001-80';
const OPERATOR_EMAIL = process.env.E2E_OPERATOR_EMAIL ?? 'bruno@senior.com.br';
const OPERATOR_NAME = process.env.E2E_OPERATOR_NAME ?? 'Bruno LiteLLM QA';
const WATERFALL_TIMEOUT_MS = Number(process.env.LITELLM_WATERFALL_TIMEOUT_MS ?? 150_000); // 2 min 30 s

const FLOW_LABELS = [
  'fluxo-1-deepseek-r1',
  'fluxo-2-v4-flash',
  'fluxo-3-kimi-k2',
  'fluxo-4-rotacao',
  'fluxo-5-fallback-check',
] as const;

test.describe('LiteLLM live — 5 fluxos paralelos', () => {
  test.describe.configure({ mode: 'parallel', timeout: WATERFALL_TIMEOUT_MS + 90_000 });

  for (const flowLabel of FLOW_LABELS) {
    test(`waterfall completo @ ${flowLabel}`, async ({ page }) => {
      test.info().annotations.push({ type: 'flow', description: flowLabel });

      await setupE2EAuth(page, { email: OPERATOR_EMAIL, name: OPERATOR_NAME });
      await installCNPJStub(page);
      await preventMigrationNotice(page);

      await completeOnboarding(page, { email: OPERATOR_EMAIL, name: OPERATOR_NAME });
      await dismissMigrationNotice(page);

      const companySuffix = e2eCompanyName(`LiteLLM ${flowLabel}`);
      await page.getByTestId('investigation-cnpj-input').fill(SCHEFFER_CNPJ);
      await page.getByTestId('investigation-cnpj-validate-button').click({ force: true });
      await expect(page.getByTestId('investigation-company-input')).not.toHaveValue('', { timeout: 45_000 });

      await page.getByTestId('investigation-company-input').fill(companySuffix);
      await page.getByTestId('investigation-city-input').fill('Chapecó');
      await page.getByTestId('investigation-uf-input').fill('SC');
      await page.getByTestId('investigation-submit-button').click({ force: true });

      await dismissDuplicateDossierModal(page);

      await expect(
        page
          .getByTestId('cofre-overlay')
          .or(page.getByTestId('loading-smart-overlay'))
          .or(page.getByTestId('inline-loading-bubble'))
          .first(),
      ).toBeVisible({ timeout: 45_000 });

      await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: WATERFALL_TIMEOUT_MS });
      await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: WATERFALL_TIMEOUT_MS });

      const cofre = page.getByTestId('cofre-overlay');
      if (await cofre.isVisible().catch(() => false)) {
        await expect(cofre).toBeHidden({ timeout: 30_000 });
      }

      const panel = page.getByTestId('chat-main-panel');
      await expect(panel).toBeVisible();
      const bot = panel.getByTestId('bot-message-content').last();
      await expect(bot).toBeVisible({ timeout: 45_000 });

      const text = await bot.innerText();
      expect(text.length).toBeGreaterThan(500);

      const hasContent = /Scheffer|Sapezal|agro|CNPJ|dossi/i.test(text);
      const looksLikeDossier = /#+\s|\[\[PORTA|módulo|mercado|operação/i.test(text);
      expect(hasContent || looksLikeDossier).toBe(true);

      console.log(`\n✅ ${flowLabel} OK — ${text.length} chars`);
    });
  }
});
