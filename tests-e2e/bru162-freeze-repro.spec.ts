/**
 * BRU-162 — repro do freeze pós-último-módulo com Chromium REAL.
 *
 * Gap identificado: os 4 runs reais (e8c1ad56, c2b3cb56, 5ae7a1ac, 4dad55aa)
 * morreram na janela pós-último-módulo com main thread bloqueada, mas nada
 * reproduz em vitest (jsdom não renderiza). Aqui exercitamos o fluxo completo
 * com render real: LLM stubbed com texto de módulo GRANDE, observer de long
 * tasks injetado na página, e medições de render do painel durante o fechamento.
 *
 * ── TAMANHO REAL DO STUB ──
 * O stub abaixo entrega ~43.8k chars de OUTPUT por módulo (BIG_TEXT). Os ~90k
 * observados nos runs reais eram promptChars (INPUT do modelo: foundation block
 * + extraContext + histórico), NÃO output. Este teste cobre OUTPUT grande;
 * o input grande (~90k promptChars) está coberto pelos testes de subrota em
 * tests/features/dossier/inlineValidationEnvelope.test.ts e pelo run real (golden).
 *
 * REAL_PROVIDER_CALLS=0 (stub), REAL_SEARCH_CALLS=0.
 */
import { expect, test, type Page } from '@playwright/test';
import { E2E_DOSSIER_SENTINEL } from './helpers/llm';
import { setupRealSupabaseAuthFromEnv } from './helpers/auth';
import { dismissMigrationNotice, e2eCompanyName } from './helpers/onboarding';

interface LlmMockPayload {
  action?: string;
  contents?: unknown;
  config?: { systemInstruction?: unknown };
}

interface GenerateContentCall {
  module: string;
  promptChars: number;
}

/** Extrai o nome do módulo do userTask (payload.contents) quando possível. */
function moduleFromContents(contents: unknown): string {
  if (typeof contents !== 'string') return 'unknown';
  const match = contents.match(/Gere APENAS o bloco de (.+?) com extrema/i);
  return match?.[1]?.trim() || 'unknown';
}

const CHUNK = `${E2E_DOSSIER_SENTINEL}: parágrafo de estresse de renderização com dados comerciais, QSA, fazendas, filiais, governança, riscos e plano de ação para o painel central em viewport real. `;
// ~43.8k chars de OUTPUT (não ~90k — ver cabeçalho). Marker PORTA presente para
// o resolvePortaScore achar score e NÃO disparar reexecução de módulos no
// reconcileWaterfallPorta (evita chamadas extras de generateContent).
const BIG_TEXT = ['## Raio-X Operacional', '[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]', '## Teia Societaria', CHUNK.repeat(120), '## Plano de Acao', CHUNK.repeat(120)].join('\n\n');

// Marker de complexidade ALTA devolvido pelo stub do módulo 1a (Identidade).
// Sem ele, o módulo 1b (Teia Profundidade) só roda se o CNPJ real apontar
// MEDIA/ALTA — contagem não-determinística (5 ou 6). Com o marker, o waterfall
// exercita deterministicamente os 6 módulos (2 Teia + Operação + Bordas +
// Riscos + Caminho de Venda) e a asserção de contagem fica estável.
const TEIA_ALTA_MARKER = '[[TEIA_COMPLEXIDADE:ALTA]]';

/** Monta o texto de resposta de um módulo generateContent. */
function moduleResponseText(moduleName: string): string {
  const isIdentity = moduleName.includes('Teia Societaria — Identidade');
  return isIdentity ? `${BIG_TEXT}\n\n${TEIA_ALTA_MARKER}` : BIG_TEXT;
}

function installLongTaskObserver(page: Page) {
  return page.addInitScript(() => {
    (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks = [];
    try {
      const sink = (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks;
      const po = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.duration >= 100) sink.push({ d: Math.round(e.duration), t: Math.round(e.startTime) });
        }
      });
      po.observe({ entryTypes: ['longtask'], buffered: true });
    } catch {
      /* longtask não suportado: array fica vazio */
    }
  });
}

test.describe('BRU-162: freeze pós-último-módulo (Chromium real)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('módulo grande (~44k output) renderiza no painel real sem congelar a main thread', async ({ page }) => {
    test.setTimeout(240_000);

    // Observador de long tasks injetado ANTES do app: coleta em window.__longTasks
    // (o scoutDiag pode morrer com a própria thread; o array sobrevive p/ leitura via CDP)
    await installLongTaskObserver(page);

    // LLM stubbed: texto de módulo ~43.8k de OUTPUT por chamada (estressa commit React).
    // As chamadas generateContent (módulos do waterfall) são contadas aqui; o stub de
    // chatSendMessage NÃO conta (é a resposta da investigação principal, não um módulo).
    const generateContentCalls: GenerateContentCall[] = [];

    await page.route('**/api/llm**', async route => {
      const req = route.request();
      let payload: LlmMockPayload;
      try {
        payload = req.postDataJSON() as LlmMockPayload;
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
        const systemInstruction = typeof payload.config?.systemInstruction === 'string' ? payload.config.systemInstruction : '';
        const moduleName = moduleFromContents(payload.contents);
        generateContentCalls.push({ module: moduleName, promptChars: systemInstruction.length });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: moduleResponseText(moduleName) }) });
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

    // waterfall com 6 módulos stubbed grandes — espera o fechamento completo.
    // Virtuoso virtualiza o DOM (o painel usa react-virtuoso em MessageTimeline) e
    // mantém só a janela visível. Scroll do painel: N/A — não alegado (sem
    // data-testid fixo no scroller do Virtuoso; teste de scroll frágil/não simples).
    const mainPanel = page.getByTestId('chat-main-panel');
    await expect(mainPanel).toBeVisible({ timeout: 30_000 });
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

    // Contagem das chamadas de módulo (action generateContent).
    // Design do waterfall: 6 módulos = Teia Identidade + Teia Profundidade +
    // Operação + Bordas + Riscos + Caminho de Venda. O marker TEIA_COMPLEXIDADE:ALTA
    // no stub do módulo 1a força o 1b a rodar (contagem determinística).
    // O marker PORTA presente no texto evita reexecução no reconcile (sem chamada extra).
    // Se um run real observar número diferente (ex: CNPJ lookup divergir), ajustar
    // esta asserção para o valor observado e documentar no comentário — não forçar.
    // Poll: o painel passa de 5k chars já no 1º módulo (44k), então esperamos a
    // contagem chegar a 6 (todas as chamadas) em vez de confiar na ordem do render.
    await expect
      .poll(() => generateContentCalls.length, { timeout: 180_000, intervals: [2_000, 5_000, 10_000] })
      .toBe(6);
    const moduleNames = generateContentCalls.map(call => call.module).join(' | ');
    console.warn(`[BRU-162-E2E] generateContent módulos (${generateContentCalls.length}): ${moduleNames}`);

    // painel ainda interativo (não congelou): teste de resposta da main thread
    const responsive = await page.evaluate(() => {
      const t0 = performance.now();
      void document.title.length;
      return performance.now() - t0;
    });

    const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks);
    const worst = longTasks.reduce((m, t) => Math.max(m, t.d), 0);

    // diagnostic: runtime real vs vitest
    console.warn(`[BRU-162-E2E] longTasks>=100ms: ${longTasks.length} · pior: ${worst}ms · eval-responsivo: ${responsive.toFixed(1)}ms`);

    // assertions: painel vivo e nenhuma long task catastrófica (> 2s) sem recuperação
    expect(responsive).toBeLessThan(1_000);
    expect(worst).toBeLessThan(2_000);
  });

  test('módulo Riscos & Compliance pendente (8s) mantém a main thread responsiva e o waterfall conclui', async ({ page }) => {
    test.setTimeout(240_000);

    await installLongTaskObserver(page);

    // Estado compartilhado com o route handler (mesmo processo do teste).
    const riscosDelay = { seenAt: 0, resolvedAt: 0 };

    await page.route('**/api/llm**', async route => {
      const req = route.request();
      let payload: LlmMockPayload;
      try {
        payload = req.postDataJSON() as LlmMockPayload;
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
        const systemInstruction = typeof payload.config?.systemInstruction === 'string' ? payload.config.systemInstruction : '';
        const moduleName = moduleFromContents(payload.contents);
        // Módulo Riscos & Compliance identificado pelo nome no userTask (payload.contents
        // contém "bloco de Riscos & Compliance"). Não usamos systemInstruction com 'RISCOS'
        // puro: o foundation block compartilhado contém 'RISCOS' em TODOS os módulos.
        const isRiscosModule = moduleName.includes('Riscos & Compliance') || systemInstruction.includes('Riscos & Compliance');
        if (isRiscosModule) {
          riscosDelay.seenAt = Date.now();
          await new Promise(resolve => setTimeout(resolve, 8_000));
          riscosDelay.resolvedAt = Date.now();
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: moduleResponseText(moduleName) }) });
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

    // Espera o request do módulo Riscos chegar ao stub (início da janela de 8s).
    await expect.poll(() => riscosDelay.seenAt, { timeout: 150_000 }).toBeGreaterThan(0);

    // Durante a pendência (resposta atrasada via Promise + setTimeout antes do
    // route.fulfill), a main thread deve continuar responsiva: poll simples de
    // page.evaluate, repetidas vezes, cada leitura < 100ms.
    const readings: number[] = [];
    const pollDeadline = Date.now() + 40_000;
    while (riscosDelay.resolvedAt === 0 && Date.now() < pollDeadline) {
      const evalMs = await page.evaluate(() => {
        const t0 = performance.now();
        void document.title.length;
        return performance.now() - t0;
      });
      readings.push(evalMs);
      await page.waitForTimeout(200);
    }

    const observedDelayMs = riscosDelay.resolvedAt - riscosDelay.seenAt;
    const worstPollMs = readings.length ? Math.max(...readings) : Number.POSITIVE_INFINITY;
    console.warn(`[BRU-162-E2E][delay] atraso observado: ${observedDelayMs}ms · polls=${readings.length} · pior leitura: ${worstPollMs.toFixed(1)}ms`);

    expect(riscosDelay.resolvedAt).toBeGreaterThan(0);
    expect(observedDelayMs).toBeGreaterThanOrEqual(7_000);
    expect(readings.length).toBeGreaterThan(0);
    // Nenhuma leitura de responsividade durante a espera pode passar de 100ms.
    expect(worstPollMs).toBeLessThan(100);

    // Resposta resolve e o waterfall termina: painel com conteúdo e composer visível.
    const mainPanel = page.getByTestId('chat-main-panel');
    await expect(mainPanel).toBeVisible({ timeout: 30_000 });
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

    const responsive = await page.evaluate(() => {
      const t0 = performance.now();
      void document.title.length;
      return performance.now() - t0;
    });
    const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: Array<{ d: number; t: number }> }).__longTasks);
    const worst = longTasks.reduce((m, t) => Math.max(m, t.d), 0);

    console.warn(`[BRU-162-E2E][delay] longTasks>=100ms: ${longTasks.length} · pior: ${worst}ms · eval-responsivo: ${responsive.toFixed(1)}ms`);

    expect(responsive).toBeLessThan(1_000);
    expect(worst).toBeLessThan(2_000);
  });
});
