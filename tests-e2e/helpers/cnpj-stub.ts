import type { Page } from '@playwright/test';
import { installFastGeminiStubs } from './gemini';

const STUB_COMPANY_DATA = {
  cnpj: '04733767000180',
  companyName: 'Scheffer S.A.',
  city: 'Chapecó',
  state: 'SC',
};

export async function installCNPJStub(page: Page) {
  await page.route('**/api/cnpj**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_COMPANY_DATA),
    });
  });
}

export async function installAllE2EStubs(page: Page) {
  await installFastGeminiStubs(page);
  await installCNPJStub(page);
}
