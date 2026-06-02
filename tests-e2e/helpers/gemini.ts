import type { Page, Route } from '@playwright/test';

const DETERMINISTIC_WATERFALL_TEXT = [
  '## Raio-X Operacional',
  'Fluxo deterministico do dossie para validar recuperacao do loading.',
  '[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]',
].join('\n\n');

const DETERMINISTIC_CHAT_REPLY = 'Resposta deterministica de teste.';

interface GeminiRequestBody {
  action?: string;
  config?: {
    responseMimeType?: string;
  };
  name?: string;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubGeminiApi(route: Route) {
  let payload: GeminiRequestBody = {};
  try {
    payload = route.request().postDataJSON() as GeminiRequestBody;
  } catch {
    payload = {};
  }

  switch (payload.action) {
    case 'recordDiagnostics':
      await fulfillJson(route, { ok: true });
      return;
    case 'health':
      await fulfillJson(route, { ok: true, text: 'ok' });
      return;
    case 'createCachedContent':
      await fulfillJson(route, {
        name: 'cachedContents/e2e-waterfall',
        expireTime: new Date(Date.now() + 60_000).toISOString(),
      });
      return;
    case 'deleteCachedContent':
      await fulfillJson(route, { ok: true });
      return;
    case 'chatSendMessage':
      await fulfillJson(route, {
        text: DETERMINISTIC_CHAT_REPLY,
        groundingUsed: false,
        webVerificationStatus: 'not_applicable',
      });
      return;
    case 'generateContent': {
      const text =
        payload.config?.responseMimeType === 'application/json'
          ? JSON.stringify([
              'Qual frente ja exige acao executiva?',
              'Onde a operacao ainda depende de improviso?',
              'Que risco pode escalar nos proximos 90 dias?',
              'Qual gargalo financeiro segue invisivel?',
            ])
          : DETERMINISTIC_WATERFALL_TEXT;

      await fulfillJson(route, { text });
      return;
    }
    default:
      await fulfillJson(route, { error: `Unsupported Gemini action: ${payload.action || 'unknown'}` }, 400);
  }
}

export async function installFastGeminiStubs(page: Page) {
  await page.route('**/api/gemini**', stubGeminiApi);
}
