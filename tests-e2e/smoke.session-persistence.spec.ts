// ⚠️ OBSOLETO: Este teste usa IndexedDB (scout360_sessions_v2) que foi removido.
// A persistência agora vai direto no Supabase.
// Substituído por: tests-e2e/smoke.storage-supabase.spec.ts
// Manter até migrar para o novo modelo de persistência.

import { expect, test, type Page, type Route } from '@playwright/test';

const DETERMINISTIC_WATERFALL_TEXT = [
  '## Raio-X Operacional',
  'Fluxo determinístico do dossiê para validar persistência local após reload.',
  '[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]',
].join('\n\n');

const DETERMINISTIC_CHAT_REPLY = 'Resposta determinística de teste';
const KEYVAL_DB_NAME = 'keyval-store';
const KEYVAL_STORE_NAME = 'keyval';
const SESSIONS_STORAGE_KEY = 'scout360_sessions_v2';
const EXPECTED_SESSION_TITLE = 'Fazenda Modelo';

interface GeminiRequestBody {
  action?: string;
  config?: {
    responseMimeType?: string;
  };
}

interface PersistedSessionSnapshot {
  title: string | null;
  messages: string[];
}

interface PersistedSessionState {
  hasSession: boolean;
  title: string | null;
  hasUserMsg: boolean;
  hasBotReply: boolean;
}

async function stubGeminiApi(route: Route) {
  const payload = route.request().postDataJSON() as GeminiRequestBody;

  if (payload.action === 'chatSendMessage') {
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: DETERMINISTIC_CHAT_REPLY,
        groundingUsed: false,
      }),
    });
    return;
  }

  if (payload.action === 'generateContent') {
    const responseText =
      payload.config?.responseMimeType === 'application/json'
        ? JSON.stringify([
            'Qual frente já exige ação executiva?',
            'Onde a operação ainda depende de improviso?',
            'Que risco pode escalar nos próximos 90 dias?',
            'Qual gargalo financeiro segue invisível?',
          ])
        : DETERMINISTIC_WATERFALL_TEXT;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: responseText }),
    });
    return;
  }

  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Unsupported Gemini action in smoke test' }),
  });
}

async function stubAppsScript(route: Route) {
  const request = route.request();
  const url = new URL(request.url());

  if (url.searchParams.get('q') === 'warmup') {
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    return;
  }

  if (url.searchParams.get('mode') === 'benchmark') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        mode: 'benchmark',
        keywords: url.searchParams.get('keywords') || '',
        total: 0,
        results: [],
      }),
    });
    return;
  }

  if (url.searchParams.has('q')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        query: url.searchParams.get('q') || '',
        encontrado: false,
        total: 0,
        results: [],
      }),
    });
    return;
  }

  if (url.searchParams.get('action') === 'listSessions') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, sessions: [] }),
    });
    return;
  }

  if (request.method() === 'POST') {
    const rawBody = request.postData() || '{}';
    const action = (() => {
      try {
        const parsed = JSON.parse(rawBody) as { action?: string };
        return parsed.action || '';
      } catch {
        return '';
      }
    })();

    const successBody =
      action === 'listSessions'
        ? { ok: true, sessions: [] }
        : action === 'getSession'
          ? { ok: false, session: null }
          : { ok: true };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successBody),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  });
}

async function installNetworkStubs(page: Page) {
  await page.route('**/api/llm', stubGeminiApi);
  await page.route('**/macros/s/*/exec*', stubAppsScript);
}

async function openInvestigation(page: Page) {
  await page.goto('/');

  const greetingNameInput = page.getByTestId('greeting-name-input');
  const greetingSubmitButton = page.getByTestId('greeting-submit-button');

  await expect(greetingNameInput).toBeVisible({ timeout: 10000 });
  await greetingNameInput.fill('Bruno');
  await expect(greetingNameInput).toHaveValue('Bruno');
  await greetingNameInput.press('Tab');
  await expect(greetingSubmitButton).toBeEnabled();
  await greetingSubmitButton.click();

  await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
  await page.getByTestId('investigation-city-input').fill('Cuiabá');
  await page.getByTestId('investigation-uf-input').fill('MT');
  await page.getByTestId('investigation-submit-button').click();

  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Fluxo determinístico do dossiê').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('send-message-button')).toBeVisible({ timeout: 20000 });
}

async function readPersistedSessionCount(page: Page): Promise<number> {
  const snapshot = await readPersistedSessionsSnapshot(page);
  return snapshot.length;
}

async function readPersistedSessionsSnapshot(page: Page): Promise<PersistedSessionSnapshot[]> {
  return page.evaluate(
    ({ databaseName, storeName, storageKey }) =>
      new Promise<PersistedSessionSnapshot[]>(resolve => {
        const request = indexedDB.open(databaseName);

        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const database = request.result;
          const finish = (result: PersistedSessionSnapshot[]) => {
            database.close();
            resolve(result);
          };
          let transaction: IDBTransaction;
          let store: IDBObjectStore;

          try {
            transaction = database.transaction(storeName, 'readonly');
            store = transaction.objectStore(storeName);
          } catch {
            finish([]);
            return;
          }

          const getRequest = store.get(storageKey);

          getRequest.onerror = () => finish([]);
          getRequest.onsuccess = () => {
            const value = getRequest.result;
            if (!Array.isArray(value)) {
              finish([]);
              return;
            }

            finish(
              value.map((session: { title?: string | null; messages?: Array<{ text?: string | null }> }) => ({
                title: session.title || null,
                messages: Array.isArray(session.messages)
                  ? session.messages.map(message => (message?.text || '').trim()).filter(Boolean)
                  : [],
              })),
            );
          };
        };
      }),
    {
      databaseName: KEYVAL_DB_NAME,
      storeName: KEYVAL_STORE_NAME,
      storageKey: SESSIONS_STORAGE_KEY,
    },
  );
}

async function readPersistedSessionState(page: Page): Promise<PersistedSessionState> {
  const sessions = await readPersistedSessionsSnapshot(page);
  const messages = sessions[0]?.messages || [];

  return {
    hasSession: sessions.length > 0,
    title: sessions[0]?.title ?? null,
    hasUserMsg: messages.some(message => message.includes('Qual frente exige atenção imediata?')),
    hasBotReply: messages.some(message => message.includes(DETERMINISTIC_CHAT_REPLY)),
  };
}

async function expectPersistedFollowUp(page: Page) {
  await expect
    .poll(async () => readPersistedSessionState(page), { timeout: 15000 })
    .toEqual({
      hasSession: true,
      title: EXPECTED_SESSION_TITLE,
      hasUserMsg: true,
      hasBotReply: true,
    });
}

test.describe('Scout smoke - session persistence', () => {
  test('deve salvar a sessão local e restaurar o histórico após reload', async ({ page }) => {
    await installNetworkStubs(page);
    await openInvestigation(page);

    const chatInput = page.getByTestId('chat-input');
    const chatSendButton = page.getByTestId('send-message-button');

    await chatInput.fill('Qual frente exige atenção imediata?');
    await expect(chatInput).toHaveValue('Qual frente exige atenção imediata?');
    await expect(chatSendButton).toBeEnabled();
    await chatSendButton.click();

    await expect.poll(async () => readPersistedSessionCount(page), { timeout: 15000 }).toBeGreaterThan(0);
    await expectPersistedFollowUp(page);

    await page.reload();

    await expect(page.getByTestId('greeting-card')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('chat-header-title')).toContainText(EXPECTED_SESSION_TITLE);
    await expect(page.getByText('Fluxo determinístico do dossiê').first()).toBeVisible({ timeout: 15000 });
    await expectPersistedFollowUp(page);
  });
});
