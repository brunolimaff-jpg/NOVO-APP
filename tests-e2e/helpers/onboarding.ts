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
      localStorage.setItem(operatorEmailKey, 'qa.e2e@senior.com.br');
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

  await expect(greeting.or(investigationInput).first()).toBeVisible({ timeout: 15_000 });

  if (await investigationInput.isVisible().catch(() => false)) {
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

  if (expectInvestigationForm) {
    await expect(investigationInput).toBeVisible({ timeout: 15_000 });
  }
}

export async function startNewInvestigation(page: Page) {
  const candidates = [
    page.getByRole('button', { name: /nova pesquisa do zero/i }).first(),
    page.getByRole('button', { name: /nova investigação|nova investigacao|nova pesquisa/i }).first(),
    page.getByTestId('new-investigation-button'),
    page.getByTestId('sidebar-new-investigation-button'),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await candidate.click({ force: true });
      return;
    }
  }

  const companyInput = page.getByTestId('investigation-company-input');
  if (await companyInput.isVisible({ timeout: 2_000 }).catch(() => false)) return;

  throw new Error('Não encontrei ação para iniciar nova investigação');
}

export async function dismissDuplicateDossierModal(page: Page, options: { timeoutMs?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const newResearch = page
    .getByTestId('duplicate-dossier-new-research-button')
    .or(page.getByRole('button', { name: /nova pesquisa do zero|pesquisar novamente|nova pesquisa/i }))
    .first();
  if (await newResearch.isVisible({ timeout: timeoutMs }).catch(() => false)) {
    await newResearch.click();
    await expect(newResearch)
      .toBeHidden({ timeout: 5_000 })
      .catch(() => undefined);
  }
}
