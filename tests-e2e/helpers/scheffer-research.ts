import { expect, type APIResponse, type Page, type Response } from '@playwright/test';
import { setupE2EAuth, setupRealSupabaseAuthFromEnv } from './auth';
import {
  completeOnboarding,
  dismissDuplicateDossierModal,
  dismissMigrationNotice,
  preventMigrationNotice,
  startNewInvestigation,
} from './onboarding';

export const SCHEFFER_CNPJ_FORMATTED = '04.733.767/0001-80';
export const SCHEFFER_CNPJ_DIGITS = '04733767000180';

export const OPERATOR_EMAIL = process.env.E2E_OPERATOR_EMAIL ?? 'bruno@senior.com.br';
export const OPERATOR_NAME = process.env.E2E_OPERATOR_NAME ?? 'Bruno Research QA';
export const WATERFALL_TIMEOUT_MS = Number(process.env.LITELLM_WATERFALL_TIMEOUT_MS ?? 180_000);
const USE_REAL_AUTH = process.env.E2E_REAL_AUTH === '1';
/** Live preview /api/cnpj pode levar 60–90s (BrasilAPI + cold start Vercel). */
export const CNPJ_LOOKUP_TIMEOUT_MS = Number(process.env.E2E_CNPJ_LOOKUP_TIMEOUT_MS ?? 90_000);

export interface CnpjLivePayload {
  companyName?: string;
  city?: string;
  state?: string;
  qsa?: Array<{ name?: string }>;
}

export interface SocioSearchCapture {
  ok: boolean;
  status: number;
  degraded: boolean;
  companiesCount: number;
}

export interface SessionMetadata {
  breadcrumbTitle: string | null;
  operatorId: string | null;
  operatorEmail: string | null;
}

export async function setupSchefferResearchAuth(page: Page) {
  if (USE_REAL_AUTH) {
    await setupRealSupabaseAuthFromEnv(page, { email: OPERATOR_EMAIL });
    return;
  }

  await setupE2EAuth(page, { email: OPERATOR_EMAIL, name: OPERATOR_NAME });
  await preventMigrationNotice(page);
}

export async function prepareSchefferInvestigationForm(page: Page) {
  if (USE_REAL_AUTH) {
    await expect(page.getByTestId('app-shell').or(page.getByTestId('operator-menu-button')).first()).toBeVisible({
      timeout: 30_000,
    });
  } else {
    await completeOnboarding(page, { email: OPERATOR_EMAIL, name: OPERATOR_NAME });
  }

  await dismissMigrationNotice(page);
  await startNewInvestigation(page);
  await expect(page.getByTestId('investigation-cnpj-input')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/dados do alvo/i)).toBeVisible({ timeout: 15_000 });
}

export function captureCnpjLookup(page: Page, timeoutMs = CNPJ_LOOKUP_TIMEOUT_MS) {
  return new Promise<Response>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      page.off('response', onResponse);
      reject(new Error(`Timeout ${timeoutMs}ms aguardando GET /api/cnpj`));
    }, timeoutMs);

    const onResponse = (response: Response) => {
      if (!response.url().includes('/api/cnpj') || response.request().method() !== 'GET') return;
      clearTimeout(timeoutId);
      page.off('response', onResponse);
      resolve(response);
    };

    page.on('response', onResponse);
  });
}

export async function assertCnpjLivePayload(response: Response | APIResponse) {
  expect(response.ok(), `CNPJ lookup falhou com HTTP ${response.status()}`).toBeTruthy();
  const payload = (await response.json()) as CnpjLivePayload;
  expect(payload.qsa?.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(payload.companyName ?? '').toMatch(/scheffer/i);
  return payload;
}

export function watchSocioSearchResponses(page: Page, bucket: SocioSearchCapture[]) {
  return page.on('response', async response => {
    if (!response.url().includes('/api/socio-search') || response.request().method() !== 'POST') return;

    const status = response.status();
    const ok = response.ok();
    let degraded: boolean;
    let companiesCount: number;

    try {
      const payload = (await response.json()) as { degraded?: boolean; companies?: unknown[] };
      degraded = Boolean(payload.degraded) || !ok;
      companiesCount = payload.companies?.length ?? 0;
    } catch {
      degraded = true;
      companiesCount = 0;
    }

    bucket.push({ ok, status, degraded, companiesCount });
  });
}

export function assertSocioSearchMetrics(captures: SocioSearchCapture[]) {
  const okResponses = captures.filter(item => item.ok);
  expect(okResponses.length).toBeGreaterThanOrEqual(1);

  const totalCompanies = captures.reduce((sum, item) => sum + item.companiesCount, 0);
  expect(totalCompanies).toBeGreaterThanOrEqual(3);

  const degradedEmpty = captures.filter(item => item.degraded && item.companiesCount === 0);
  const degradedRatio = captures.length > 0 ? degradedEmpty.length / captures.length : 1;
  expect(degradedRatio).toBeLessThan(0.5);
}

export async function assertCnpjApiLive(page: Page) {
  const response = await page.request.get(`/api/cnpj?cnpj=${SCHEFFER_CNPJ_DIGITS}`);
  return assertCnpjLivePayload(response);
}

export async function ensureInvestigationForm(page: Page) {
  const cnpjInput = page.getByTestId('investigation-cnpj-input');
  if (await cnpjInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return;
  }

  const submitReady = page.getByRole('button', { name: /iniciar investigação completa/i });
  if (await submitReady.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return;
  }

  await startNewInvestigation(page);
  await expect(cnpjInput.or(submitReady).first()).toBeVisible({ timeout: 15_000 });
}

export async function validateCnpjInForm(page: Page) {
  await ensureInvestigationForm(page);
  const payload = await assertCnpjApiLive(page);

  await page.getByTestId('investigation-cnpj-input').click();
  await page.getByTestId('investigation-cnpj-input').fill('');
  await page.getByTestId('investigation-cnpj-input').pressSequentially(SCHEFFER_CNPJ_DIGITS, { delay: 30 });

  const browserLookup = captureCnpjLookup(page, CNPJ_LOOKUP_TIMEOUT_MS).catch(() => null);
  if (
    await page
      .getByTestId('investigation-cnpj-validate-button')
      .isEnabled()
      .catch(() => false)
  ) {
    await page.getByTestId('investigation-cnpj-validate-button').click();
  } else {
    await page.getByTestId('investigation-cnpj-input').press('Tab');
  }

  const browserResponse = await browserLookup;
  if (browserResponse) {
    await assertCnpjLivePayload(browserResponse);
  }

  const companyInput = page.getByTestId('investigation-company-input');
  const companyPopulated = await companyInput
    .inputValue()
    .then(value => value.trim().length > 0)
    .catch(() => false);

  if (!companyPopulated) {
    await expect
      .poll(async () => (await companyInput.inputValue()).trim().length, { timeout: 20_000 })
      .toBeGreaterThan(0)
      .catch(async () => {
        await companyInput.fill(payload.companyName ?? 'SCHEFFER & CIA LTDA');
        const cityInput = page.getByTestId('investigation-city-input');
        const ufInput = page.getByTestId('investigation-uf-input');
        if (!(await cityInput.inputValue()).trim()) {
          await cityInput.fill(payload.city ?? 'Sapezal');
        }
        if (!(await ufInput.inputValue()).trim()) {
          await ufInput.fill(payload.state ?? 'MT');
        }
      });
  }

  return payload;
}

export async function submitSchefferInvestigation(page: Page, _runLabel?: string) {
  await ensureInvestigationForm(page);

  const cnpjInput = page.getByTestId('investigation-cnpj-input');
  const payload = (await cnpjInput.isVisible({ timeout: 1_000 }).catch(() => false))
    ? await validateCnpjInForm(page)
    : await assertCnpjApiLive(page);

  const companyName = payload.companyName?.trim() || 'SCHEFFER & CIA LTDA';
  const city = payload.city?.trim() || 'Sapezal';
  const state = payload.state?.trim() || 'MT';

  await page.getByTestId('investigation-company-input').fill(companyName);
  await page.getByTestId('investigation-city-input').fill(city);
  await page.getByTestId('investigation-uf-input').fill(state);
  const submitButton = page.getByTestId('investigation-submit-button');
  await expect(submitButton).toBeVisible({ timeout: 10_000 });
  await submitButton.click();

  const locationStatus = page.getByTestId('investigation-location-status');
  await expect(locationStatus)
    .toContainText(/validando|validada|não encontrada/i, { timeout: 15_000 })
    .catch(() => undefined);

  const invalidLocation = await locationStatus
    .filter({ hasText: /não encontrada/i })
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (invalidLocation) {
    throw new Error(`Localização Scheffer recusada antes do waterfall: ${await locationStatus.innerText()}`);
  }

  await dismissDuplicateDossierModal(page, { timeoutMs: 30_000 });

  await expect(
    page
      .getByTestId('cofre-overlay')
      .or(page.getByTestId('loading-smart-overlay'))
      .or(page.getByTestId('inline-loading-bubble'))
      .first(),
  ).toBeVisible({ timeout: 45_000 });

  return companyName;
}

export async function waitForLoadingToFinish(page: Page, timeoutMs = WATERFALL_TIMEOUT_MS) {
  await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: timeoutMs });
  await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: timeoutMs });

  const cofre = page.getByTestId('cofre-overlay');
  if (await cofre.isVisible().catch(() => false)) {
    await expect(cofre).toBeHidden({ timeout: 30_000 });
  }
}

export async function waitForClienteSeniorModule(page: Page, timeoutMs = WATERFALL_TIMEOUT_MS) {
  const panel = page.getByTestId('chat-main-panel');
  const seniorLabel = panel.getByText(/CLIENTE SENIOR CONFIRMADO/i);
  await expect(seniorLabel).toBeVisible({ timeout: timeoutMs });
  await seniorLabel.scrollIntoViewIfNeeded().catch(() => undefined);
  await expect(panel.getByText(/\b74\b[\s\S]{0,24}Módulo/i)).toBeVisible({ timeout: 30_000 });
}

export async function waitForSocietaryMapShell(page: Page, timeoutMs = WATERFALL_TIMEOUT_MS) {
  await expect(page.getByTestId('societary-map-shell')).toBeVisible({ timeout: timeoutMs });
}

export async function assertSocietaryEvidence(page: Page) {
  await page.getByTestId('societary-evidence-toggle').click({ force: true });
  const evidenceList = page.getByTestId('societary-evidence-list');
  await expect(evidenceList).toBeVisible({ timeout: 15_000 });
  await expect(evidenceList).toContainText(/Colombia|Participações|Guilherme/i);
}

export function countNaoEncontrado(text: string): number {
  const matches = text.match(/NÃO encontrado|NAO encontrado/gi);
  return matches?.length ?? 0;
}

export async function tryExpandFullReport(page: Page) {
  const expandButton = page.getByRole('button', { name: /Ver relatório completo/i }).first();
  const visible = await expandButton.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!visible) {
    return { clicked: false, panelEmpty: false, textLength: 0 };
  }

  await expandButton.click({ force: true });
  const panel = page.getByTestId('chat-main-panel');
  const bot = panel.getByTestId('bot-message-content').last();
  await expect(bot).toBeVisible({ timeout: 15_000 });
  const text = await bot.innerText();
  return {
    clicked: true,
    panelEmpty: text.trim().length < 50,
    textLength: text.length,
  };
}

export async function captureSessionMetadata(page: Page): Promise<SessionMetadata> {
  return page.evaluate(() => {
    const PREFIX = 'scout360:';
    const breadcrumb = document.querySelector('[data-testid="chat-header-breadcrumb-session"]');
    return {
      breadcrumbTitle: breadcrumb?.textContent?.trim() ?? null,
      operatorId: localStorage.getItem(PREFIX + 'operator_id'),
      operatorEmail: localStorage.getItem(PREFIX + 'operator_email'),
    };
  });
}
