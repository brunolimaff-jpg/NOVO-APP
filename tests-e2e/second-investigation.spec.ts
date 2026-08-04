// tests-e2e/second-investigation.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { E2E_DOSSIER_SENTINEL, installFastLlmStubs } from './helpers/llm';
import {
  completeOnboarding,
  dismissDuplicateDossierModal,
  dismissMigrationNotice,
  e2eCompanyName,
  startNewInvestigation,
} from './helpers/onboarding';

const LOADING_TIMEOUT_MS = 120_000;
/** POST_API_SAFETY_TIMEOUT_MS (10s) + DISSOLVE_DURATION_MS (350ms) após loading terminar */
const COFRE_DISSOLVE_TIMEOUT_MS = 15_000;

async function waitForLoadingIndicatorsToHide(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
  await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
  const cofre = page.getByTestId('cofre-overlay');
  if (await cofre.isVisible().catch(() => false)) {
    await expect(cofre).toBeHidden({ timeout: COFRE_DISSOLVE_TIMEOUT_MS });
  }
}

async function submitInvestigation(page: import('@playwright/test').Page, companyName: string) {
  await page.getByTestId('investigation-company-input').fill(companyName);
  await page.getByTestId('investigation-city-input').fill('Cuiabá');
  await page.getByTestId('investigation-uf-input').fill('MT');
  await page.getByTestId('investigation-submit-button').click({ force: true });
}

async function waitForDossierComplete(page: import('@playwright/test').Page) {
  await waitForLoadingIndicatorsToHide(page);
  const bot = page.getByTestId('chat-main-panel').getByTestId('bot-message-content').last();
  await expect(bot).toBeVisible({ timeout: 15_000 });
  await expect(bot).toContainText(E2E_DOSSIER_SENTINEL, { timeout: 15_000 });
}

test.describe('Segunda investigação — anti-regressão P0', () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ page }) => {
    await setupE2EAuth(page, { uniqueOperator: true });
    await installFastLlmStubs(page);
  });

  test('investigação A completa → nova investigação → investigação B sem Refinando sinais', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);

    const companyA = e2eCompanyName('Fazenda Investigacao A');
    await submitInvestigation(page, companyA);
    await waitForDossierComplete(page);

    await startNewInvestigation(page);
    await dismissDuplicateDossierModal(page);

    const companyBPrefix = 'Fazenda Investigacao B';
    const companyB = e2eCompanyName(companyBPrefix);
    await submitInvestigation(page, companyB);

    const loading = page
      .getByTestId('cofre-overlay')
      .or(page.getByTestId('loading-smart-overlay'))
      .or(page.getByTestId('inline-loading-bubble'));
    await expect(loading.first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('Refinando sinais')).toHaveCount(0);

    await waitForDossierComplete(page);
    // Breadcrumb usa truncate — match no prefixo estável, não no sufixo aleatório
    await expect(page.getByTestId('chat-header-breadcrumb-session')).toContainText(companyBPrefix, {
      timeout: 15_000,
    });
  });
});
