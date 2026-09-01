/**
 * BRU-162 — repro do freeze pós-último-módulo com Chromium REAL.
 *
 * Gap identificado: os 4 runs reais (e8c1ad56, c2b3cb56, 5ae7a1ac, 4dad55aa)
 * morreram na janela pós-último-módulo com main thread bloqueada, mas nada
 * reproduz em vitest (jsdom não renderiza). Aqui exercitamos o fluxo completo
 * com render real: LLM stubbed com texto de módulo GIGANTE (~90k chars, como
 * no run real com prompt 92k), observer de long tasks injetado na página,
 * e medições de render do painel durante o fechamento.
 *
 * REAL_PROVIDER_CALLS=0 (stub), REAL_SEARCH_CALLS=0.
 */
import { expect, test } from '@playwright/test';
import { E2E_DOSSIER_SENTINEL } from './helpers/llm';
import { setupRealSupabaseAuthFromEnv } from './helpers/auth';
import { dismissMigrationNotice, e2eCompanyName } from './helpers/onboarding';

test.describe('BRU-162: freeze pós-último-módulo (Chromium real)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('módulo gigante (~90k) renderiza no painel real sem congelar a main thread', async ({ page }) => {
    test.setTimeout(240_000);

    // Observador de long tasks injetado ANTES do app: coleta em window.__longTasks
    // (o scoutDiag pode morrer com a própria thread; o array sobrevive p/ leitura via CDP)
    await page.addInitScript(() => {
      (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks = [];
      try {
        const sink = (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks;
        const po = new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.duration >= 100) sink.push({ d: Math.round(e.duration), t: Math.round(e.startTime) });
          }
        });
        po.observe({ entryTypes: ['longtask'], buffered: true } as PerformanceObserverInit);
      } catch {
        /* longtask não suportado: array fica vazio */
      }
    });

    // LLM stubbed: texto de módulo ~90k (estressa commit React do Virtuoso)
    const CHUNK = `${E2E_DOSSIER_SENTINEL}: parágrafo de estresse de renderização com dados comerciais, QSA, fazendas, filiais, governança, riscos e plano de ação para o painel central em viewport real. `;
    const BIG_TEXT = ['## Raio-X Operacional', '[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]', '## Teia Societaria', CHUNK.repeat(120), '## Plano de Acao', CHUNK.repeat(120)].join('\n\n'); // ~90k

    await page.route('**/api/llm**', async route => {
      const req = route.request();
      let payload: { action?: string } = {};
      try {
        payload = req.postDataJSON() as { action?: string };
      } catch {
        payload = {};
      }
      if (payload.action === 'recordDiagnostics' || payload.action === 'health') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        return;
      }
      if (payload.action === 'chatSendMessage') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: BIG_TEXT, webVerificationStatus: 'not_applicable' }) });
        return;
      }
      if (payload.action === 'generateContent') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: BIG_TEXT }) });
        return;
      }
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unsupported' }) });
    });

    await setupRealSupabaseAuthFromEnv(page, { email: 'teste@senior.com.br' });
    await dismissMigrationNotice(page);
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName());
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    // waterfall com 6 módulos stubbed gigantes — espera o fechamento completo
    const mainPanel = page.getByTestId('chat-main-panel');
    await expect(mainPanel).toBeVisible({ timeout: 30_000 });
    // Virtuoso virtualiza o DOM: o painel mantém só a janela visível (~20k chars).
    // O sinal de "waterfall completo" é o composer acessível + painel com conteúdo.
    await expect
      .poll(
        async () => {
          const text = await mainPanel.textContent().catch(() => '');
          return (text ?? '').length;
        },
        { timeout: 180_000, intervals: [2_000, 5_000, 10_000] },
      )
      .toBeGreaterThan(5_000);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 60_000 });

    // painel ainda interativo (não congelou): teste de resposta da main thread
    const responsive = await page.evaluate(() => {
      const t0 = performance.now();
      // eslint-disable-next-line no-console
      void document.title.length;
      return performance.now() - t0;
    });

    const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks);
    const worst = longTasks.reduce((m, t) => Math.max(m, t.d), 0);

    // diagnostic: runtime real vs vitest
    console.log(`[BRU-162-E2E] longTasks>=100ms: ${longTasks.length} · pior: ${worst}ms · eval-responsivo: ${responsive.toFixed(1)}ms`);

    // assertions: painel vivo e nenhuma long task catastrófica (> 2s) sem recuperação
    expect(responsive).toBeLessThan(1_000);
    expect(worst).toBeLessThan(2_000);
  });
});
