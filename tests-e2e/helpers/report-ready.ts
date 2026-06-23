import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { setupRealSupabaseAuthFromEnv } from './auth';
import {
  prepareSchefferInvestigationForm,
  submitSchefferInvestigation,
  validateCnpjInForm,
  SCHEFFER_CNPJ_FORMATTED,
} from './scheffer-research';

/** Hard-cap waterfall no código (`waterfall-orchestrator.ts`). */
export const WATERFALL_WAIT_MS = 330_000;

/** Buffer pós-waterfall (Cofre / render estático). */
export const COFRE_BUFFER_MS = 60_000;

/** Timeout total do gate live (waterfall + buffer). */
export const REPORT_READY_TIMEOUT_MS = Number(
  process.env.REPORT_READY_TIMEOUT_MS ?? WATERFALL_WAIT_MS + COFRE_BUFFER_MS,
);

/** Margem para setup (auth, CNPJ live, onboarding). */
export const REPORT_READY_SETUP_MARGIN_MS = 120_000;

export const REPORT_READY_MIN_TEXT_LENGTH = 500;

export const DEFAULT_REPORT_READY_OPERATOR_EMAIL = process.env.E2E_OPERATOR_EMAIL ?? 'bruno.ferreira@senior.com.br';

export interface ReportReadyEnvironment {
  baseURL: string;
  deploymentSha?: string;
  operatorEmail: string;
}

export function requireReportReadyEnvironment(testInfo: TestInfo): ReportReadyEnvironment {
  const baseURL = String(testInfo.project.use.baseURL ?? process.env.BASE_URL ?? '');
  if (!baseURL.startsWith('https://')) {
    throw new Error('report-ready exige BASE_URL HTTPS (preview Vercel) — nunca localhost para gate final');
  }
  if (process.env.E2E_REAL_AUTH !== '1') {
    throw new Error('report-ready exige E2E_REAL_AUTH=1 (auth Supabase real, sem bypass localStorage)');
  }
  if (!process.env.E2E_AUTH_PASSWORD) {
    throw new Error('report-ready exige E2E_AUTH_PASSWORD (local: env; CI: secret GOLDEN_E2E_AUTH_PASSWORD)');
  }
  const operatorEmail = process.env.E2E_OPERATOR_EMAIL ?? DEFAULT_REPORT_READY_OPERATOR_EMAIL;
  if (!operatorEmail) {
    throw new Error('report-ready exige E2E_OPERATOR_EMAIL (CI: secret GOLDEN_E2E_OPERATOR_EMAIL)');
  }

  const deploymentSha = process.env.E2E_DEPLOYMENT_SHA?.trim();
  return { baseURL, deploymentSha, operatorEmail };
}

export async function setupReportReadyAuth(page: Page, email = DEFAULT_REPORT_READY_OPERATOR_EMAIL) {
  // loginViaSupabase configura localStorage e abre AuthModal — preventMigrationNotice conflita (auth_skip_until).
  await setupRealSupabaseAuthFromEnv(page, { email });
}

export async function assertServedDeploymentSha(request: APIRequestContext, page: Page, expectedSha: string) {
  expect(expectedSha, 'E2E_DEPLOYMENT_SHA deve ser um SHA Git completo').toMatch(/^[a-f0-9]{40}$/i);
  const scripts = await page
    .locator('script[src]')
    .evaluateAll(elements => elements.map(element => (element as HTMLScriptElement).src).filter(Boolean));
  expect(scripts.length, 'o app precisa carregar ao menos um bundle JavaScript').toBeGreaterThan(0);

  let servedShaFound = false;
  for (const scriptUrl of scripts) {
    const response = await request.get(scriptUrl, { failOnStatusCode: true, timeout: 30_000 });
    if ((await response.text()).includes(expectedSha)) {
      servedShaFound = true;
      break;
    }
  }
  expect(servedShaFound, `nenhum bundle servido contém o SHA esperado ${expectedSha}`).toBe(true);
}

const loadingOverlay = (page: Page) =>
  page
    .getByTestId('cofre-overlay')
    .or(page.getByTestId('loading-smart-overlay'))
    .or(page.getByTestId('inline-loading-bubble'))
    .first();

export async function assertWaterfallStarted(page: Page) {
  await expect(loadingOverlay(page)).toBeVisible({ timeout: 45_000 });
}

export async function waitForReportReadyLoadingOff(page: Page, timeoutMs = REPORT_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());

  await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: remaining() });
  await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: remaining() });

  // Waterfall LiteLLM pode manter o Cofre visível durante o loop de módulos (>> 60s).
  // Budget compartilhado até REPORT_READY_TIMEOUT_MS — não usar COFRE_BUFFER_MS isolado aqui.
  await expect(page.getByTestId('cofre-overlay')).not.toBeVisible({ timeout: remaining() });
}

export async function assertReportVisible(page: Page, minLength = REPORT_READY_MIN_TEXT_LENGTH) {
  const panel = page.getByTestId('chat-main-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const bot = panel.getByTestId('bot-message-content').last();
  await expect(bot).toBeVisible({ timeout: 45_000 });
  const text = await bot.innerText();
  expect(text.length, 'conteúdo do relatório abaixo do mínimo funcional').toBeGreaterThanOrEqual(minLength);
  return { textLength: text.length };
}

export async function assertComposerUsable(page: Page) {
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 15_000 });
  await expect(chatInput).toBeEnabled({ timeout: 15_000 });
}

export async function runReportReadyFlow(page: Page, runLabel?: string) {
  await prepareSchefferInvestigationForm(page);
  await validateCnpjInForm(page);
  await submitSchefferInvestigation(page, runLabel ?? `report-ready ${Date.now()}`);
  await assertWaterfallStarted(page);
  await waitForReportReadyLoadingOff(page);
  const { textLength } = await assertReportVisible(page);
  await assertComposerUsable(page);
  return { cnpj: SCHEFFER_CNPJ_FORMATTED, textLength };
}
