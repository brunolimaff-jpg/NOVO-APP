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

const LIFECYCLE_RPC_NAMES = new Set([
  'create_or_get_dossier_run',
  'get_own_dossier_run',
  'acquire_dossier_run_lease',
  'renew_dossier_run_lease',
  'release_dossier_run_lease',
  'complete_dossier_run',
]);

interface LifecycleCapture {
  rpc: string;
  ok: boolean;
  statusCode: number;
  runId?: string;
  dossierId?: string;
  lifecycleStatus?: string;
  leaseExpiresAt?: string;
  completedAt?: string;
}

interface GenerationCapture {
  ok: boolean;
  statusCode: number;
  fallbackUsed?: boolean;
}

const REMOVED_PERSISTENCE_INVARIANTS = {
  REPORT_CHARS: 'SUPERSEDED_BY_REPORT_AND_RUBRIC',
  STRUCTURAL_SCORE: 'SUPERSEDED_BY_RUBRIC',
  COMPLETED_AT: 'OBSERVED_FROM_COMPLETE_DOSSIER_RUN',
} as const;

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function safeIso(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function lifecycleRow(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) return (payload[0] ?? {}) as Record<string, unknown>;
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

async function captureLifecycleResponse(response: import('@playwright/test').Response): Promise<LifecycleCapture | null> {
  const pathname = new URL(response.url()).pathname;
  const rpc = pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
  if (!rpc || !LIFECYCLE_RPC_NAMES.has(rpc) || response.request().method() !== 'POST') return null;
  let row: Record<string, unknown> = {};
  try {
    row = lifecycleRow(await response.json());
  } catch {
    // A failed or empty response is still represented by statusCode/ok only.
  }
  const lifecycleStatus = typeof row.status === 'string' ? row.status.toUpperCase() : undefined;
  return {
    rpc,
    ok: response.ok(),
    statusCode: response.status(),
    runId: safeUuid(row.run_id ?? row.id),
    dossierId: safeUuid(row.dossier_id),
    lifecycleStatus,
    leaseExpiresAt: safeIso(row.lease_expires_at),
    completedAt: safeIso(row.completed_at),
  };
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
  const lifecycleCaptures: LifecycleCapture[] = [];
  const generationCaptures: GenerationCapture[] = [];
  const webSearchCaptures: WebSearchCapture[] = [];
  const socioSearchCaptures: SocioSearchCapture[] = [];

  page.on('response', async response => {
    const capture = await captureLifecycleResponse(response);
    if (capture) lifecycleCaptures.push(capture);
    const pathname = new URL(response.url()).pathname;
    if (pathname === '/api/gemini' && response.request().method() === 'POST') {
      let fallbackUsed: boolean | undefined;
      try {
        const body = (await response.json()) as unknown;
        const fallbackValue =
          body && typeof body === 'object' && 'fallbackUsed' in body
            ? (body as { fallbackUsed?: unknown }).fallbackUsed
            : undefined;
        if (typeof fallbackValue === 'boolean') fallbackUsed = fallbackValue;
      } catch {
        // A non-JSON response remains observable as status-only and is blocked below.
      }
      generationCaptures.push({ ok: response.ok(), statusCode: response.status(), fallbackUsed });
    }
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
          lifecycleCaptures.some(
            capture =>
              capture.rpc === 'complete_dossier_run' &&
              capture.ok &&
              capture.lifecycleStatus === 'COMPLETED' &&
              Boolean(capture.runId) &&
              Boolean(capture.dossierId),
          ),
        {
          message: 'complete_dossier_run precisa responder COMPLETED com run_id e dossier_id',
          timeout: 60_000,
        },
      )
      .toBe(true);

    expect(
      generationCaptures.some(capture => capture.ok),
      `a geração real precisa observar ao menos uma resposta 2xx de /api/gemini: ${JSON.stringify(generationCaptures)}`,
    ).toBe(true);
    const completion = [...lifecycleCaptures].reverse().find(
      capture =>
        capture.rpc === 'complete_dossier_run' &&
        capture.ok &&
        capture.lifecycleStatus === 'COMPLETED' &&
        capture.runId &&
        capture.dossierId,
    );
    expect(completion?.runId, 'complete_dossier_run deve retornar run_id').toMatch(UUID_PATTERN);
    const completedRunId = completion?.runId;
    const createOrRetrieve = [...lifecycleCaptures].reverse().find(
      capture =>
        capture.rpc === 'create_or_get_dossier_run' &&
        capture.ok &&
        capture.runId === completedRunId,
    );
    const lease = lifecycleCaptures.find(
      capture =>
        capture.rpc === 'acquire_dossier_run_lease' &&
        capture.ok &&
        capture.runId === completedRunId &&
        capture.lifecycleStatus === 'RUNNING' &&
        Boolean(capture.leaseExpiresAt),
    );
    expect(createOrRetrieve?.runId, 'criação/recuperação deve retornar o mesmo run_id concluído').toBe(completedRunId);
    expect(lease?.runId, 'lease RUNNING deve usar o mesmo run_id concluído').toBe(completedRunId);
    expect(lease?.leaseExpiresAt, 'lease RUNNING deve retornar expiração ISO válida').toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(completion?.dossierId, 'complete_dossier_run deve retornar dossier_id').toMatch(UUID_PATTERN);
    expect(
      completion?.completedAt,
      'complete_dossier_run deve retornar completed_at observável e parseável',
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    await testInfo.attach(`golden-round-${round}-live-captures`, {
      body: Buffer.from(
        JSON.stringify(
          {
            lifecycleCaptures,
            generationCaptures,
            webSearchCaptures,
            socioSearchCaptures,
            persistenceInvariants: REMOVED_PERSISTENCE_INVARIANTS,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });

    const fallbackCapture = generationCaptures.find(capture => typeof capture.fallbackUsed === 'boolean');
    if (!fallbackCapture) {
      throw new Error(
        'BLOCKED_OBSERVABILITY_GAP: /api/gemini não expõe fallbackUsed de forma segura; o Golden não pode inferir ausência de fallback',
      );
    }
    expect(fallbackCapture.fallbackUsed, 'fallback do provedor reprova o golden live').toBe(false);

    return { rubric, lifecycleCaptures, runId: completion!.runId! };
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
