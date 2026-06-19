import { expect, type Page } from '@playwright/test';

const MIGRATION_SEEN_KEY = 'scout360:supabase_migration_seen';
const AUTH_SKIP_KEY = 'scout360:auth_skip_until';
const OPERATOR_EMAIL_KEY = 'scout360:operator_email';

export function e2eOperatorEmail(prefix = 'qa.e2e') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}.${suffix}@senior.com.br`;
}

export function e2eCompanyName(prefix = 'Fazenda E2E') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix} ${suffix}`;
}

export async function preventMigrationNotice(page: Page) {
  await page.addInitScript(
    ({ migrationSeenKey, authSkipKey, operatorEmailKey }) => {
      localStorage.setItem(migrationSeenKey, 'true');
      if (!localStorage.getItem(operatorEmailKey)) {
        localStorage.setItem(operatorEmailKey, 'qa.e2e@senior.com.br');
      }
      localStorage.setItem(authSkipKey, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    },
    {
      migrationSeenKey: MIGRATION_SEEN_KEY,
      authSkipKey: AUTH_SKIP_KEY,
      operatorEmailKey: OPERATOR_EMAIL_KEY,
    },
  );
}

export async function dismissMigrationNotice(page: Page) {
  const migrationDismiss = page.getByRole('button', { name: /entendi.*começar|entendi|começar/i }).first();

  if (await migrationDismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
    await migrationDismiss.click({ force: true });
    await expect(migrationDismiss)
      .toBeHidden({ timeout: 5000 })
      .catch(() => undefined);
  }
}

export async function dismissMigrationBanner(page: Page) {
  const banner = page.locator('.fixed.top-0.left-0.right-0.z-40').filter({ hasText: /cadastre sua senha/i });

  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await banner.evaluate(el => el.remove());
  }
}

interface DismissDuplicateDossierOptions {
  required?: boolean;
  timeoutMs?: number;
}

export async function dismissDuplicateDossierModal(
  page: Page,
  options: DismissDuplicateDossierOptions = {},
) {
  const { timeoutMs = 30_000, required = false } = options;
  await dismissMigrationBanner(page);

  const modalHeading = page.getByRole('heading', { name: /dossiê existente/i });
  const appeared = await modalHeading
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    if (required) {
      throw new Error('Modal "Dossiê existente" esperado mas não apareceu');
    }
    return;
  }

  const novaPesquisa = page.getByRole('button', { name: /nova pesquisa do zero/i });
  await expect(novaPesquisa).toBeVisible({ timeout: 5_000 });
  await novaPesquisa.click({ force: true });
  await expect(modalHeading).toBeHidden({ timeout: 30_000 });

  const investigationStarted = page
    .getByTestId('cofre-overlay')
    .or(page.getByTestId('loading-smart-overlay'))
    .or(page.getByTestId('inline-loading-bubble'))
    .or(page.getByTestId('bot-message-content'));
  await expect(investigationStarted.first()).toBeVisible({ timeout: 30_000 });
}

export async function openSidebarIfNeeded(page: Page) {
  const novaInvestigacao = page.getByRole('button', { name: /nova investigação/i }).first();

  if (await novaInvestigacao.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  const sidebarToggle = page.getByTestId('sidebar-toggle');
  if (await sidebarToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sidebarToggle.click({ force: true });
    await expect(novaInvestigacao).toBeVisible({ timeout: 5000 });
  }
}

export async function startNewInvestigation(page: Page) {
  await dismissMigrationBanner(page);

  const investigationInput = page.getByTestId('investigation-company-input');

  if (await investigationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  const sessionBreadcrumb = page.getByTestId('chat-header-breadcrumb-session');
  const chatMainPanel = page.getByTestId('chat-main-panel');

  if (await chatMainPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
    const homeBreadcrumb = page.getByTestId('chat-header-breadcrumb-home');
    if (await sessionBreadcrumb.isVisible({ timeout: 2000 }).catch(() => false)) {
      await homeBreadcrumb.evaluate(el => (el as HTMLElement).click());
      await expect(sessionBreadcrumb)
        .toBeHidden({ timeout: 10_000 })
        .catch(() => undefined);

      if (await investigationInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        return;
      }

      // Debounce compartilhado com o botão da sidebar (NEW_SESSION_DEBOUNCE_MS).
      await page.waitForTimeout(600);
    }
  }

  await openSidebarIfNeeded(page);

  const novaInvestigacao = page
    .locator('#sessions-sidebar-panel')
    .getByRole('button', { name: /nova investigação/i });
  await expect(novaInvestigacao).toBeVisible({ timeout: 5000 });
  await novaInvestigacao.evaluate(el => (el as HTMLElement).click());
  await expect(investigationInput).toBeVisible({ timeout: 15_000 });
}

async function ensureInvestigationLanding(page: Page) {
  await startNewInvestigation(page);
}

interface CompleteOnboardingOptions {
  email?: string;
  expectInvestigationForm?: boolean;
  goto?: boolean;
  name?: string;
}

export async function completeOnboarding(page: Page, options: CompleteOnboardingOptions = {}) {
  const { email = e2eOperatorEmail(), expectInvestigationForm = true, goto = true, name = 'Test Bot Senior' } = options;

  if (goto) {
    await preventMigrationNotice(page);
    await page.goto('/');
  }

  const greeting = page.getByTestId('greeting-card');
  const investigationInput = page.getByTestId('investigation-company-input');
  const chatShell = page.getByTestId('message-input').or(page.getByTestId('chat-main-panel'));

  await expect(greeting.or(investigationInput).or(chatShell).first()).toBeVisible({ timeout: 15_000 });

  if (await investigationInput.isVisible().catch(() => false)) {
    return;
  }

  const chatMainPanel = page.getByTestId('chat-main-panel');
  if (await chatMainPanel.isVisible().catch(() => false)) {
    await startNewInvestigation(page);
    return;
  }

  if (await greeting.isVisible().catch(() => false)) {
    const nameInput = page.getByTestId('greeting-name-input');
    const emailInput = page.getByTestId('greeting-email-input');

    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill(name);
    await emailInput.fill(email);
    await page.getByTestId('greeting-submit-button').click({ force: true });

    const linkExistingUser = page.getByTestId('greeting-link-button');
    if (await linkExistingUser.isVisible({ timeout: 3000 }).catch(() => false)) {
      await linkExistingUser.click({ force: true });
    }
  }

  await ensureInvestigationLanding(page);

  if (expectInvestigationForm) {
    await expect(investigationInput).toBeVisible({ timeout: 15_000 });
  }
}
