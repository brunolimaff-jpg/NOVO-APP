/**
 * Scheffer research validation — LiteLLM/Grok real no preview Vercel.
 * SEM installCNPJStub (stub não tem QSA) e SEM installFastGeminiStubs.
 *
 * Uso:
 *   BASE_URL=https://...preview.vercel.app \
 *   E2E_OPERATOR_EMAIL=bruno@senior.com.br \
 *   E2E_OPERATOR_NAME="Bruno Research QA" \
 *   LITELLM_WATERFALL_TIMEOUT_MS=180000 \
 *   npx playwright test tests-e2e/scheffer-research-validation.spec.ts --workers=1
 */
import { expect, test } from '@playwright/test';
import {
  assertSocioSearchMetrics,
  assertSocietaryEvidence,
  captureSessionMetadata,
  countNaoEncontrado,
  prepareSchefferInvestigationForm,
  setupSchefferResearchAuth,
  submitSchefferInvestigation,
  tryExpandFullReport,
  waitForClienteSeniorModule,
  waitForLoadingToFinish,
  waitForSocietaryMapShell,
  watchSocioSearchResponses,
  WATERFALL_TIMEOUT_MS,
  type SocioSearchCapture,
} from './helpers/scheffer-research';

test.describe('Scheffer — validação pesquisa live (preview)', () => {
  test.describe.configure({ timeout: WATERFALL_TIMEOUT_MS + 180_000 });

  test('R1 — QSA live e CRM Senior (74 módulos)', async ({ page }) => {
    await setupSchefferResearchAuth(page);
    await prepareSchefferInvestigationForm(page);

    await submitSchefferInvestigation(page, `Scheffer R1 ${Date.now()}`);
    await waitForClienteSeniorModule(page);

    console.log('\n✅ R1 OK — QSA live + CLIENTE SENIOR 74 módulos');
  });

  test('R2 — socio-search e mapa societário', async ({ page }) => {
    const socioSearchCaptures: SocioSearchCapture[] = [];
    watchSocioSearchResponses(page, socioSearchCaptures);

    await setupSchefferResearchAuth(page);
    await prepareSchefferInvestigationForm(page);
    await submitSchefferInvestigation(page, `Scheffer R2 ${Date.now()}`);

    await waitForSocietaryMapShell(page);
    await expect
      .poll(() => socioSearchCaptures.length, {
        message: 'socio-search precisa registrar ao menos uma resposta durante o waterfall',
        timeout: WATERFALL_TIMEOUT_MS,
      })
      .toBeGreaterThan(0);

    assertSocioSearchMetrics(socioSearchCaptures);
    await assertSocietaryEvidence(page);

    console.log('\n✅ R2 OK — socio-search', {
      requests: socioSearchCaptures.length,
      companies: socioSearchCaptures.reduce((sum, item) => sum + item.companiesCount, 0),
    });
  });

  test('R3 — waterfall Grok completo (sem stubs)', async ({ page }) => {
    await setupSchefferResearchAuth(page);
    await prepareSchefferInvestigationForm(page);
    await submitSchefferInvestigation(page, `Scheffer R3 ${Date.now()}`);

    await waitForLoadingToFinish(page);

    const panel = page.getByTestId('chat-main-panel');
    await expect(panel).toBeVisible();
    const bot = panel.getByTestId('bot-message-content').last();
    await expect(bot).toBeVisible({ timeout: 45_000 });

    const text = await bot.innerText();
    expect(text.length).toBeGreaterThan(500);

    const naoEncontradoCount = countNaoEncontrado(text);
    console.log(`\n📊 R3 — ocorrências "NÃO encontrado": ${naoEncontradoCount}`);

    const expandResult = await tryExpandFullReport(page);
    if (expandResult.clicked) {
      console.log(
        `\n📊 R3 — expand relatório: textLength=${expandResult.textLength}, panelEmpty=${expandResult.panelEmpty}`,
      );
      if (expandResult.panelEmpty) {
        console.warn('⚠️ H5 candidato — painel vazio após "Ver relatório completo"');
      }
    }

    const sessionMeta = await captureSessionMetadata(page);
    console.log('\n📎 R3 — session metadata:', sessionMeta);

    console.log(`\n✅ R3 OK — dossiê ${text.length} chars`);
  });
});
