#!/usr/bin/env node

const rawBaseUrl = process.env.PREVIEW_URL;

if (!rawBaseUrl) {
  console.error('❌ PREVIEW_URL não definido.');
  process.exit(1);
}

const baseUrl = rawBaseUrl.replace(/\/$/, '');
const routes = (process.env.SMOKE_ROUTES || '/,/login,/dashboard')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);

const requestTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const vercelAutomationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const allowProtectedSkip = process.env.SMOKE_ALLOW_PROTECTED_SKIP === 'true';
const protectionBypassHeaders = vercelAutomationBypassSecret
  ? {
      'x-vercel-protection-bypass': vercelAutomationBypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : {};

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function getStatus(url, options = {}) {
  const { signal, cancel } = withTimeout(requestTimeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...protectionBypassHeaders,
        ...options.headers,
      },
      signal,
      redirect: 'follow',
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    cancel();
  }
}

async function run() {
  const checks = [];

  checks.push({
    name: 'app carrega',
    target: `${baseUrl}/`,
    ...(await getStatus(`${baseUrl}/`)),
    expected: '200-399',
  });

  for (const route of routes) {
    const target = `${baseUrl}${route}`;
    checks.push({
      name: `rota responde: ${route}`,
      target,
      ...(await getStatus(target)),
      expected: '200-399',
    });
  }

  const apiTarget = `${baseUrl}/api/link-status`;
  checks.push({
    name: 'endpoint crítico /api/link-status',
    target: apiTarget,
    ...(await getStatus(apiTarget, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    })),
    expected: '200',
  });

  let hasFailure = false;

  console.log(`\n🔎 Smoke test em: ${baseUrl}`);
  for (const check of checks) {
    const pass =
      check.name.includes('/api/link-status')
        ? check.status === 200
        : check.ok && check.status >= 200 && check.status < 400;

    if (!pass) hasFailure = true;

    const icon = pass ? '✅' : '❌';
    const details = check.error ? ` | erro: ${check.error}` : '';
    console.log(
      `${icon} ${check.name} -> ${check.target} | recebido: ${check.status} | esperado: ${check.expected}${details}`
    );
  }

  if (hasFailure) {
    const looksLikeProtectedPreview = checks.length > 0 && checks.every((check) => check.status === 401);
    if (allowProtectedSkip && !vercelAutomationBypassSecret && looksLikeProtectedPreview) {
      console.warn(
        '\n⚠️ Preview protegido retornou 401 e VERCEL_AUTOMATION_BYPASS_SECRET não está configurado. Smoke ignorado.'
      );
      return;
    }

    console.error('\n❌ Smoke falhou.');
    process.exit(1);
  }

  console.log('\n✅ Smoke finalizado com sucesso.');
}

run();
