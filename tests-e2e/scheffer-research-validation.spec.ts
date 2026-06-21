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

interface WebSearchCapture {
  status: number;
  source?: string;
  resultCount: number;
  degraded?: boolean;
  brave?: {
    attempted?: boolean;
    rawCount?: number;
    afterFinalLimitCount?: number;
    emptyReason?: string;
    queryVariant?: string;
  };
}

interface ExperimentCapture {
  status: number;
  action?: string;
  ok: boolean;
  fallbackUsed?: boolean;
  runStatus?: string;
}

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
    const webSearchCaptures: WebSearchCapture[] = [];
    const experimentCaptures: ExperimentCapture[] = [];

    page.on('response', async response => {
      if (response.url().includes('/api/open-web-search') && response.request().method() === 'POST') {
        const status = response.status();
        try {
          const payload = (await response.json()) as {
            source?: string;
            results?: unknown[];
            sources?: unknown[];
            degraded?: boolean;
            _debug?: {
              braveAttempted?: boolean;
              brave?: {
                rawCount?: number;
                afterFinalLimitCount?: number;
                emptyReason?: string;
                queryVariant?: string;
              };
            };
          };
          webSearchCaptures.push({
            status,
            source: payload.source,
            resultCount: (payload.results ?? payload.sources)?.length ?? 0,
            degraded: payload.degraded,
            brave: {
              attempted: payload._debug?.braveAttempted,
              rawCount: payload._debug?.brave?.rawCount,
              afterFinalLimitCount: payload._debug?.brave?.afterFinalLimitCount,
              emptyReason: payload._debug?.brave?.emptyReason,
              queryVariant: payload._debug?.brave?.queryVariant,
            },
          });
        } catch {
          webSearchCaptures.push({ status, resultCount: 0, degraded: true });
        }
      }

      if (response.url().includes('/api/llm-experiment') && response.request().method() === 'POST') {
        const status = response.status();
        let action: string | undefined;
        let fallbackUsed: boolean | undefined;
        let runStatus: string | undefined;
        try {
          const body = JSON.parse(response.request().postData() ?? '{}') as {
            action?: string;
            fallbackUsed?: boolean;
            status?: string;
          };
          action = body.action;
          fallbackUsed = body.fallbackUsed;
          runStatus = body.status;
        } catch {
          // Corpo não parseável: manter apenas status HTTP.
        }
        experimentCaptures.push({ status, action, ok: response.ok(), fallbackUsed, runStatus });
      }
    });

    await setupSchefferResearchAuth(page);
    await prepareSchefferInvestigationForm(page);
    await submitSchefferInvestigation(page, `Scheffer R3 ${Date.now()}`);

    // Espera o dossiê aparecer (conteúdo > loading). Se loading ficar preso,
    // safety net do waterfall (60s) + force-hide resgatam o teste.
    const panel = page.getByTestId('chat-main-panel');
    await expect(panel).toBeVisible();
    const bot = panel.getByTestId('bot-message-content').last();
    await expect(bot).toBeVisible({ timeout: WATERFALL_TIMEOUT_MS + 60_000 });
    // Force-hide loading elements que podem ter ficado presos
    await page.evaluate(() => {
      document.querySelector('[data-testid="inline-loading-bubble"]')?.setAttribute('style', 'display:none');
      document.querySelector('[data-testid="loading-smart-overlay"]')?.setAttribute('style', 'display:none');
    });

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
    console.log('\n📎 R3 — web search captures:', webSearchCaptures);
    console.log('\n📎 R3 — experiment captures:', experimentCaptures);

    expect(webSearchCaptures.length, 'web search precisa ser chamada durante waterfall LiteLLM').toBeGreaterThan(0);
    expect(
      webSearchCaptures.some(item => item.brave?.attempted && (item.brave.rawCount ?? 0) > 0),
      'Brave precisa ser tentado com rawCount > 0',
    ).toBeTruthy();
    expect(
      webSearchCaptures.some(item => item.resultCount > 0 && item.degraded !== true),
      'web search precisa retornar fontes curadas sem degradação',
    ).toBeTruthy();

    const finalize = experimentCaptures.find(item => item.action === 'finalizeRun');
    expect(experimentCaptures.some(item => item.action === 'createRun' && item.ok), 'createRun precisa passar').toBeTruthy();
    expect(finalize?.ok, 'finalizeRun precisa passar').toBeTruthy();
    expect(finalize?.fallbackUsed, 'fallback Gemini não pode ser usado como sucesso').toBe(false);

    console.log(`\n✅ R3 OK — dossiê ${text.length} chars`);
  });
});
