import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type TestInfo } from '@playwright/test';
import {
  evaluateDossierGolden,
  loadJsonFixture,
  loadTextFixture,
  type DossierGoldenCase,
  withSchefferGoldenRubric,
} from '../tests/helpers/dossierGolden';
import {
  prepareSchefferInvestigationForm,
  setupSchefferResearchAuth,
  submitSchefferInvestigation,
  WATERFALL_TIMEOUT_MS,
} from './helpers/scheffer-research';
import { requestSourceSafely } from './helpers/safe-source-fetch';

const fixtureRoot = resolve(process.cwd(), 'tests/fixtures/dossier/scheffer-04733767000180');
const expectedMarkdown = loadTextFixture(resolve(fixtureRoot, 'expected-dossier.md'));
const dossierCase = withSchefferGoldenRubric(loadJsonFixture<DossierGoldenCase>(resolve(fixtureRoot, 'case.json')));

interface ExperimentCapture {
  action?: string;
  id?: string;
  ok: boolean;
  fallbackUsed?: boolean;
  status?: string;
  authorization?: string;
}

interface WebSearchCapture {
  ok: boolean;
  resultCount: number;
  braveAttempted: boolean;
  braveRawCount: number;
  degraded: boolean;
}

interface SocioSearchCapture {
  ok: boolean;
  companiesCount: number;
  degraded: boolean;
}

function requireLiveEnvironment(testInfo: TestInfo) {
  const baseURL = String(testInfo.project.use.baseURL ?? '');
  const deploymentSha = process.env.E2E_DEPLOYMENT_SHA?.trim();
  if (!baseURL.startsWith('https://') || !process.env.E2E_AUTH_PASSWORD || !deploymentSha) {
    throw new Error(
      'golden-dossier-live exige BASE_URL HTTPS imutável, E2E_DEPLOYMENT_SHA, E2E_REAL_AUTH=1, E2E_OPERATOR_EMAIL e E2E_AUTH_PASSWORD',
    );
  }
  if (process.env.E2E_REAL_AUTH !== '1') {
    throw new Error('golden-dossier-live proíbe auth simulada: defina E2E_REAL_AUTH=1');
  }
  return { baseURL, deploymentSha };
}

async function assertServedDeploymentSha(
  request: APIRequestContext,
  page: import('@playwright/test').Page,
  expectedSha: string,
) {
  expect(expectedSha, 'E2E_DEPLOYMENT_SHA deve ser um SHA Git completo').toMatch(/^[a-f0-9]{40}$/i);
  const scripts = await page
    .locator('script[src]')
    .evaluateAll(elements => elements.map(element => (element as HTMLScriptElement).src).filter(Boolean));
  expect(scripts.length, 'o app precisa carregar ao menos um bundle JavaScript').toBeGreaterThan(0);
  let servedShaFound = false;
  for (const scriptUrl of scripts) {
    const response = await request.get(scriptUrl, { failOnStatusCode: true, timeout: 30_000 });
    if ((await response.text()).includes(expectedSha)) {
      servedShaFound = true;
      break;
    }
  }
  expect(servedShaFound, `nenhum bundle servido contém o SHA esperado ${expectedSha}`).toBe(true);
}

async function requestExternalSource(url: string, method: 'HEAD' | 'GET') {
  try {
    return (await requestSourceSafely(url, method)).status;
  } catch {
    return 0;
  }
}

async function assertExternalSources(sources: string[]) {
  const uniqueSources = [...new Set(sources)];
  const results = await Promise.all(
    uniqueSources.map(async url => {
      const headStatus = await requestExternalSource(url, 'HEAD');
      if (headStatus >= 200 && headStatus < 400) {
        return { url, status: headStatus, method: 'HEAD' as const };
      }
      const getStatus = await requestExternalSource(url, 'GET');
      return { url, status: getStatus, method: 'GET' as const };
    }),
  );
  const reachable = results.filter(result => result.status >= 200 && result.status < 400);
  expect(reachable.length, `fontes externas não alcançáveis: ${JSON.stringify(results)}`).toBeGreaterThanOrEqual(5);
  return results;
}

async function runGoldenRound(browser: Browser, testInfo: TestInfo, round: number, baseURL: string) {
  const extraHTTPHeaders = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : undefined;
  const context = await browser.newContext({ baseURL, extraHTTPHeaders, acceptDownloads: true });
  const page = await context.newPage();
  const experimentCaptures: ExperimentCapture[] = [];
  const webSearchCaptures: WebSearchCapture[] = [];
  const socioSearchCaptures: SocioSearchCapture[] = [];

  page.on('response', async response => {
    if (!response.url().includes('/api/llm-experiment') || response.request().method() !== 'POST') return;
    let requestBody: { action?: string; id?: string; fallbackUsed?: boolean; status?: string } = {};
    let responseBody: { id?: string } = {};
    try {
      requestBody = JSON.parse(response.request().postData() ?? '{}') as typeof requestBody;
    } catch {
      // A asserção abaixo reprovará a captura sem action.
    }
    try {
      responseBody = (await response.json()) as typeof responseBody;
    } catch {
      // Respostas de erro podem não ser JSON.
    }
    experimentCaptures.push({
      action: requestBody.action,
      id: requestBody.id ?? responseBody.id,
      ok: response.ok(),
      fallbackUsed: requestBody.fallbackUsed,
      status: requestBody.status,
      authorization: (await response.request().allHeaders()).authorization,
    });
  });

  page.on('response', async response => {
    if (response.url().includes('/api/open-web-search') && response.request().method() === 'POST') {
      try {
        const body = (await response.json()) as {
          results?: unknown[];
          sources?: unknown[];
          degraded?: boolean;
          _debug?: { braveAttempted?: boolean; brave?: { rawCount?: number } };
        };
        webSearchCaptures.push({
          ok: response.ok(),
          resultCount: (body.results ?? body.sources)?.length ?? 0,
          braveAttempted: body._debug?.braveAttempted === true,
          braveRawCount: body._debug?.brave?.rawCount ?? 0,
          degraded: body.degraded === true,
        });
      } catch {
        webSearchCaptures.push({ ok: false, resultCount: 0, braveAttempted: false, braveRawCount: 0, degraded: true });
      }
    }
    if (response.url().includes('/api/socio-search') && response.request().method() === 'POST') {
      try {
        const body = (await response.json()) as { companies?: unknown[]; degraded?: boolean };
        socioSearchCaptures.push({
          ok: response.ok(),
          companiesCount: body.companies?.length ?? 0,
          degraded: body.degraded === true,
        });
      } catch {
        socioSearchCaptures.push({ ok: false, companiesCount: 0, degraded: true });
      }
    }
  });

  try {
    await setupSchefferResearchAuth(page);
    await assertServedDeploymentSha(context.request, page, process.env.E2E_DEPLOYMENT_SHA!);
    await prepareSchefferInvestigationForm(page);
    await submitSchefferInvestigation(page, 'SCHEFFER & CIA LTDA');

    const panel = page.getByTestId('chat-main-panel');
    const report = panel.getByTestId('bot-message-content').last();
    await expect(report).toBeVisible({ timeout: WATERFALL_TIMEOUT_MS + 60_000 });
    await expect(report).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: WATERFALL_TIMEOUT_MS });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: WATERFALL_TIMEOUT_MS });

    const expandButton = page.getByRole('button', { name: /Ver relatório completo/i }).first();
    await expect(expandButton).toBeVisible({ timeout: 30_000 });
    await expandButton.click();
    await expect(report).toBeVisible();
    await expect.poll(async () => (await report.innerText()).trim().length).toBeGreaterThan(500);

    await page.getByRole('button', { name: 'Exportar dossiê' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem').filter({ hasText: 'Markdown' }).click();
    const download = await downloadPromise;
    const artifactPath = testInfo.outputPath(`scheffer-golden-round-${round}.md`);
    await download.saveAs(artifactPath);
    const markdown = await readFile(artifactPath, 'utf8');
    const rubric = await evaluateDossierGolden(markdown, expectedMarkdown, dossierCase);
    const rubricBody = JSON.stringify(rubric, null, 2);

    await testInfo.attach(`golden-round-${round}-markdown`, { path: artifactPath, contentType: 'text/markdown' });
    await testInfo.attach(`golden-round-${round}-rubric`, {
      body: Buffer.from(rubricBody),
      contentType: 'application/json',
    });
    await testInfo.attach(`golden-round-${round}-screenshot`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      // network idle pode nunca estabilizar com keepalive/heartbeat no preview
    });

    expect(rubric.errors, rubricBody).toEqual([]);
    expect(rubric.passed).toBe(true);
    const sourceChecks = await assertExternalSources(rubric.sources);
    await testInfo.attach(`golden-round-${round}-source-checks`, {
      body: Buffer.from(JSON.stringify(sourceChecks, null, 2)),
      contentType: 'application/json',
    });
    expect(webSearchCaptures.length, 'waterfall precisa executar as cinco dimensões Brave').toBe(5);
    expect(
      webSearchCaptures.every(
        capture =>
          capture.ok &&
          capture.braveAttempted &&
          capture.braveRawCount > 0 &&
          capture.resultCount > 0 &&
          !capture.degraded,
      ),
      `Brave live sem resultado útil: ${JSON.stringify(webSearchCaptures)}`,
    ).toBe(true);
    expect(
      socioSearchCaptures.some(capture => capture.ok && capture.companiesCount >= 3 && !capture.degraded),
      `socio-search live sem evidência societária suficiente: ${JSON.stringify(socioSearchCaptures)}`,
    ).toBe(true);

    await expect
      .poll(
        () =>
          experimentCaptures.some(
            capture => capture.action === 'finalizeRun' && capture.ok && capture.status === 'completed',
          ),
        {
          message: 'a tentativa final de finalizeRun precisa responder completed',
          timeout: 60_000,
        },
      )
      .toBe(true);
    const create = experimentCaptures.find(capture => capture.action === 'createRun');
    const finalizations = experimentCaptures.filter(capture => capture.action === 'finalizeRun');
    const finalize = finalizations.at(-1);
    expect(create?.ok, 'createRun precisa responder com sucesso').toBe(true);
    expect(finalize?.ok, 'finalizeRun precisa responder com sucesso').toBe(true);
    expect(finalize?.id, 'finalizeRun deve persistir o mesmo id criado').toBe(create?.id);
    expect(finalize?.fallbackUsed, 'fallback Gemini reprova o golden live').toBe(false);
    expect(finalize?.status, 'a tentativa final de finalizeRun precisa concluir como completed').toBe('completed');
    expect(finalize?.authorization, 'Bearer autenticado precisa estar disponível para consultar persistência').toMatch(
      /^Bearer\s+\S+$/,
    );

    type PersistedRun = {
      run?: {
        id?: string;
        status?: string;
        fallbackUsed?: boolean;
        reportChars?: number;
        structuralScore?: number;
        completedAt?: string;
      };
    };
    let persisted: PersistedRun | null = null;
    await expect
      .poll(
        async () => {
          const response = await context.request.get(`/api/llm-experiment?id=${encodeURIComponent(finalize!.id!)}`, {
            headers: { Authorization: finalize!.authorization! },
            failOnStatusCode: false,
          });
          if (!response.ok()) return null;
          persisted = (await response.json()) as PersistedRun;
          return persisted.run?.status;
        },
        { message: 'run persistida precisa sair de running', timeout: 30_000 },
      )
      .toBe('completed');
    expect(persisted).toMatchObject({
      run: {
        id: finalize!.id,
        status: 'completed',
        fallbackUsed: false,
        reportChars: expect.any(Number),
        structuralScore: expect.any(Number),
        completedAt: expect.any(String),
      },
    });
    expect(persisted!.run!.reportChars).toBeGreaterThan(1_000);
    expect(persisted!.run!.structuralScore).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(persisted!.run!.completedAt!))).toBe(false);

    await testInfo.attach(`golden-round-${round}-live-captures`, {
      body: Buffer.from(
        JSON.stringify({ persisted, experimentCaptures, webSearchCaptures, socioSearchCaptures }, null, 2),
      ),
      contentType: 'application/json',
    });

    return { rubric, experimentCaptures, runId: finalize!.id! };
  } finally {
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await context.close();
  }
}

test.describe('Golden Dossier Scheffer live', () => {
  test.describe.configure({ mode: 'serial', timeout: (WATERFALL_TIMEOUT_MS + 240_000) * 2 });

  test('duas execuções consecutivas passam no mesmo deployment SHA', async ({ browser }, testInfo) => {
    const { baseURL, deploymentSha } = requireLiveEnvironment(testInfo);
    await testInfo.attach('deployment-sha', { body: Buffer.from(deploymentSha), contentType: 'text/plain' });

    const first = await runGoldenRound(browser, testInfo, 1, baseURL);
    const second = await runGoldenRound(browser, testInfo, 2, baseURL);
    expect(first.rubric.passed).toBe(true);
    expect(second.rubric.passed).toBe(true);

    const idProof = { round1: first.runId, round2: second.runId, distinct: first.runId !== second.runId };
    await testInfo.attach('run-id-proof', {
      body: Buffer.from(JSON.stringify(idProof, null, 2)),
      contentType: 'application/json',
    });
    expect(first.runId, 'cada rodada deve criar uma linha experimental distinta').not.toBe(second.runId);
  });
});
