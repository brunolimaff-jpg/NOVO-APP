import type { Page } from '@playwright/test';
import { installFastGeminiStubs } from './gemini';

const STUB_COMPANY_DATA = {
  cnpj: '04733767000180',
  razaoSocial: 'Scheffer S.A.',
  nomeFantasia: 'Scheffer',
  logradouro: 'Avenida das Industrias, 1500',
  municipio: 'Cuiaba',
  uf: 'MT',
  cep: '78000-000',
  situacao: 'ATIVA',
  naturezaJuridica: 'Sociedade Anonima',
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
