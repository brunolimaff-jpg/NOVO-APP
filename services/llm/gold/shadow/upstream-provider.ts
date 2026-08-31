/**
 * V6 — Shadow CxB: provider de input upstream (dossiê real por CNPJ).
 *
 * Para cada CNPJ, produz UMA vez o canonical + dossiê, congelado para os
 * 5 braços. O upstream é REAL e mensurável:
 *  1) dados cadastrais via BrasilAPI (fonte do Scout);
 *  2) pesquisa web via Brave (fonte do Scout);
 *  3) síntese do dossiê via DeepSeek v3.2 (o mesmo modelo do fluxo atual),
 *     no formato markdown do app;
 *  4) upstream_ms e upstream_cost medidos (tokens × preço de referência).
 */
import { execFileSync } from 'node:child_process';
import { callLiteLLM } from '../../../../api/_llm-client.js';
import { fetchCnpjData, buildCanonicalFromBrasilApi } from '../canonical/canonical-resolver.js';

const DEEPSEEK_PRICE_PER_M = { input: 0.74, output: 2.22 };
const UPSTREAM_MODEL = 'bedrock/deepseek.v3.2';

function resolveApiKey(): string {
  const fromEnv = process.env.LITELLM_API_KEY;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return execFileSync('security', ['find-generic-password', '-s', 'novo-app-litellm', '-w'], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
}

function normalizeCnpj(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

async function braveSearch(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`,
      { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return '';
    const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    return (data.web?.results || [])
      .filter((r) => r.title && r.description)
      .slice(0, 5)
      .map((r) => `- ${r.title}: ${r.description} (${r.url})`)
      .join('\n');
  } catch {
    return '';
  }
}

export interface UpstreamInput {
  canonical: unknown;
  dossier: string;
  upstreamMs: number;
  upstreamCostUsd: number;
}

export async function buildUpstreamInput(
  cnpj: string,
  companyName: string,
  env: Record<string, string | undefined> = process.env,
): Promise<UpstreamInput> {
  const startedAt = Date.now();
  const cnpjDigits = normalizeCnpj(cnpj);
  const apiKey = resolveApiKey();
  const braveKey = env.BRAVE_SEARCH_API_KEY || env.BRAVE_API_KEY || '';

  // 1) Canonical determinístico (mesmo resolver da V6, fronteira compartilhada)
  const cad = await fetchCnpjData(cnpjDigits);
  const canonical = buildCanonicalFromBrasilApi(cad, companyName);
  // headOffice: preservado apenas quando a fonte fornece (sem heurística de
  // sufixo — caso Scheffer prova que "0001 => Matriz" é falso).

  // 2) Pesquisa web real (Brave)
  const webContext = await braveSearch(`${companyName} ${cad.razao_social || ''} ${cad.cnae_fiscal_descricao || ''}`, braveKey);

  // 3) Síntese do dossiê via DeepSeek (mesmo modelo do fluxo atual)
  const sysPrompt =
    'Você é o pesquisador do Scout 360. Produza um dossiê comercial em pt-BR (markdown) sobre a empresa, baseado SOMENTE nos dados fornecidos. Seções: perfil, estrutura societária, operação, indicadores quando disponíveis, sinais, riscos e próximos passos. Não invente dados. Marque como não confirmado o que não estiver nos dados.';
  const userPrompt = [
    'DADOS CADASTRAIS (BrasilAPI):',
    JSON.stringify(cad, null, 1).slice(0, 6000),
    '',
    'PESQUISA WEB (Brave):',
    webContext || '(sem resultados web)',
  ].join('\n');

  const result = await callLiteLLM(
    {
      model: UPSTREAM_MODEL,
      systemInstruction: sysPrompt,
      userContent: userPrompt,
      temperature: 0.1,
      maxOutputTokens: 8192,
      timeoutMs: 170_000, // upstream real pode demorar (pesquisa + síntese longa)
      maxRetries: 1,
      action: 'gold-shadow-upstream',
    },
    { ...env, LITELLM_API_KEY: apiKey },
  );

  const upstreamMs = Date.now() - startedAt;
  const inputTokens = result.usage.promptTokenCount ?? 0;
  const outputTokens = result.usage.candidatesTokenCount ?? 0;
  const upstreamCostUsd =
    (inputTokens / 1_000_000) * DEEPSEEK_PRICE_PER_M.input +
    (outputTokens / 1_000_000) * DEEPSEEK_PRICE_PER_M.output;

  return {
    canonical,
    dossier: result.text,
    upstreamMs,
    upstreamCostUsd,
  };
}
