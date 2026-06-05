import { expect, type Page } from '@playwright/test';

const MIGRATION_SEEN_KEY = 'scout360:supabase_migration_seen';

export function e2eOperatorEmail(prefix = 'qa.e2e') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}.${suffix}@senior.com.br`;
}

export async function preventMigrationNotice(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'true');
  }, MIGRATION_SEEN_KEY);
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
