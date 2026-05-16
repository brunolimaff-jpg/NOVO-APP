// services/clientLookupService.ts
// CORRIGIDO: Timeout + Retry para App Script + Cache condicional com TTL para cold start

import { LOOKUP_URL } from "./apiConfig";
import { CONCORRENTES } from "./competitors";
import { MatchType } from "../types";
import { scoutDiag } from "../utils/diagnosticLog";

// Deriva termos-raiz a partir dos IDs dos concorrentes cadastrados (ex: 'totvs_protheus' → 'totvs')
// + termos extras (própria empresa, produtos e marcas próprias)
const _concorrentesSet = new Set<string>([
  'senior',                                          // própria empresa
  ...CONCORRENTES.map(c => c.id.split('_')[0]),      // sap, totvs, sankhya, chb, siagri, benner, lg, viasoft, unisystem
  'protheus', 'microsiga', 'datasul',                // produtos TOTVS antigos
  'oracle', 'microsoft', 'linx',                     // outros players
  // Produtos/marcas da própria Senior — evita que perguntas técnicas sejam tratadas como prospecção
  'erp', 'sapiens', 'hcm', 'gatec', 'gestão', 'gestao',
  'ronda', 'rubi', 'vetorh', 'erpx',
]);

/**
 * Retorna true se a empresa for um concorrente cadastrado, a própria Senior,
 * ou um produto/marca reconhecido (ex: "ERP Senior", "GAtec").
 * Verifica TODAS as palavras da string, não apenas a primeira.
 */
export function isConcorrenteOuPropria(empresa: string): boolean {
  const words = empresa.toLowerCase().trim().split(/[\s,]+/);
  return words.some(w => _concorrentesSet.has(w));
}

// Prefixos comuns que geram muitos falsos positivos se buscados sozinhos
const _genericPrefixes = new Set([
  'fundacao', 'fundação', 'instituto', 'cooperativa', 'cia', 'companhia',
  'grupo', 'usina', 'fazenda', 'centro', 'associacao', 'associaçao', 'associaçâo',
  'servico', 'serviço', 'brasil', 'brasileira'
]);

const LOOKUP_API_URL = LOOKUP_URL;
const TIMEOUT_MS = 15000; // 15 segundos (Apps Script cold start pode demorar)
const MAX_RETRIES = 3;
const shouldLogLookupDebug = import.meta.env?.VITE_VERBOSE_LOGS === 'true';

// TTL para resultados negativos — tempo suficiente para o Apps Script aquecer
// Após 30s, a próxima chamada refaz a busca ao invés de retornar o cache de cold start
const NOT_FOUND_TTL_MS = 30_000;

// Delay de retry quando JSON.parse falha (sinal de cold start retornando HTML)
const COLD_START_RETRY_DELAY_MS = 1500;

function describeLookupEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'lookup-endpoint';
  }
}

function truncateForDiag(value: string, maxLength = 80): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export interface ClienteResult {
  grupo: string;
  razoes_sociais: string[];
  linhas_produto: string[];
  familias_presentes: string[];
  modulos_por_familia: Record<string, string[]>;
  gaps_crosssell: string[];
  total_modulos: number;
  eh_cliente_senior: boolean;
  tem_gatec: boolean;
  tem_erp: boolean;
  tem_hcm: boolean;
  tem_logistica: boolean;
  matchType?: MatchType;
}

export interface LookupResponse {
  ok: boolean;
  query: string;
  encontrado: boolean;
  total: number;
  results: ClienteResult[];
  error?: string;
}

// Fetch com timeout
async function fetchWithTimeout(url: string, timeout: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Timeout após ${timeout / 1000}s`, { cause: err });
    }
    throw err;
  }
}

// Fetch com retry
async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (shouldLogLookupDebug) {
        scoutDiag.debug('Lookup', 'tentativa de consulta', {
          attempt,
          retries,
          endpoint: describeLookupEndpoint(url),
        });
      }
      const response = await fetchWithTimeout(url);
      if (shouldLogLookupDebug) {
        scoutDiag.debug('Lookup', 'consulta concluída', { attempt });
      }
      return response;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (shouldLogLookupDebug) {
        scoutDiag.warn('Lookup', 'tentativa de consulta falhou', {
          attempt,
          retries,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (attempt < retries) {
        // Backoff exponencial: 1s, 2s, 4s
        const wait = 1000 * Math.pow(2, attempt - 1);
        if (shouldLogLookupDebug) {
          scoutDiag.debug('Lookup', 'aguardando retry', { attempt, waitMs: wait });
        }
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  throw lastError || new Error('Falha após todas as tentativas');
}

// Cache permanente — apenas resultados encontrado=true (persiste toda a sessão)
const _lookupCache = new Map<string, LookupResponse>();

// Cache temporário para resultados negativos — protege contra cold start do Apps Script
// Expira após NOT_FOUND_TTL_MS para permitir nova tentativa quando o script já estiver aquecido
const _notFoundCache = new Map<string, { data: LookupResponse; expiresAt: number }>();

const LOOKUP_MATCH_PRIORITY: Record<MatchType, number> = {
  exact: 0,
  partial: 1,
  broad: 2,
};

function normalizeLookupBase(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLookupNoise(name: string): string {
  return (name || '')
    .replace(/^(?:(?:grupo|empresa|fazenda|usina|cia)\s+)+/i, '')
    .replace(/(?:\s+(?:ltda|s\/a|sa|eireli|me|epp)\.?)+$/i, '')
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

function normalizeLookupText(value: string): string {
  return normalizeLookupBase(stripLookupNoise(value));
}

const GENERIC_PREFIX_NORMALIZED = new Set(
  Array.from(_genericPrefixes)
    .map(prefix => normalizeLookupBase(prefix))
    .filter(Boolean),
);

const LOOKUP_TOKEN_STOPWORDS = new Set([
  ...Array.from(GENERIC_PREFIX_NORMALIZED),
  'a',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'eireli',
  'epp',
  'ltda',
  'me',
  's',
  'sa',
]);

function getRelevantLookupTokens(value: string): string[] {
  const normalized = normalizeLookupText(value);
  if (!normalized) return [];

  return [...new Set(
    normalized
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 1 && !LOOKUP_TOKEN_STOPWORDS.has(token)),
  )];
}

function isGenericLookupPrefixToken(value: string): boolean {
  return GENERIC_PREFIX_NORMALIZED.has(normalizeLookupBase(value));
}

function normalizeCacheKey(name: string): string {
  return normalizeLookupText(name);
}

interface LookupCandidateMetrics {
  matchType: MatchType;
  exactPhrase: boolean;
  matchedAllTokens: boolean;
  matchedTokenCount: number;
  labelLengthDelta: number;
  normalizedLabel: string;
}

interface RankedLookupResponse {
  response: LookupResponse;
  variant: string;
  variantIndex: number;
  isFullVariant: boolean;
  topMetrics: LookupCandidateMetrics | null;
}

function compareLookupCandidateMetrics(a: LookupCandidateMetrics, b: LookupCandidateMetrics): number {
  if (a.exactPhrase !== b.exactPhrase) return a.exactPhrase ? -1 : 1;
  if (a.matchedAllTokens !== b.matchedAllTokens) return a.matchedAllTokens ? -1 : 1;

  const priorityDiff = LOOKUP_MATCH_PRIORITY[a.matchType] - LOOKUP_MATCH_PRIORITY[b.matchType];
  if (priorityDiff !== 0) return priorityDiff;

  if (a.matchedTokenCount !== b.matchedTokenCount) return b.matchedTokenCount - a.matchedTokenCount;
  if (a.labelLengthDelta !== b.labelLengthDelta) return a.labelLengthDelta - b.labelLengthDelta;

  return a.normalizedLabel.localeCompare(b.normalizedLabel);
}

function getBestLookupCandidateMetrics(result: ClienteResult, fullQuery: string): LookupCandidateMetrics {
  const queryNormalized = normalizeLookupText(fullQuery);
  const queryTokens = getRelevantLookupTokens(fullQuery);
  const labels = [result.grupo, ...(result.razoes_sociais || [])].filter(Boolean);
  const partialTokenThreshold =
    queryTokens.length <= 1 ? 1 : Math.min(queryTokens.length, Math.max(2, Math.ceil(queryTokens.length / 2)));

  let bestMetrics: LookupCandidateMetrics | null = null;

  for (const label of labels) {
    const normalizedLabel = normalizeLookupText(label);
    if (!normalizedLabel) continue;

    const matchedTokenCount = queryTokens.filter(token => normalizedLabel.includes(token)).length;
    const exactPhrase =
      !!queryNormalized && (normalizedLabel === queryNormalized || normalizedLabel.includes(queryNormalized));
    const matchedAllTokens = queryTokens.length > 0 && matchedTokenCount === queryTokens.length;

    let matchType: MatchType = 'broad';
    if (exactPhrase) {
      matchType = 'exact';
    } else if (matchedAllTokens || matchedTokenCount >= partialTokenThreshold) {
      matchType = 'partial';
    }

    const candidateMetrics: LookupCandidateMetrics = {
      matchType,
      exactPhrase,
      matchedAllTokens,
      matchedTokenCount,
      labelLengthDelta: Math.abs(normalizedLabel.length - queryNormalized.length),
      normalizedLabel,
    };

    if (!bestMetrics || compareLookupCandidateMetrics(candidateMetrics, bestMetrics) < 0) {
      bestMetrics = candidateMetrics;
    }
  }

  return (
    bestMetrics || {
      matchType: 'broad',
      exactPhrase: false,
      matchedAllTokens: false,
      matchedTokenCount: 0,
      labelLengthDelta: Number.MAX_SAFE_INTEGER,
      normalizedLabel: normalizeLookupText(result.grupo || ''),
    }
  );
}

function rankLookupResponse(response: LookupResponse, fullQuery: string, variant: string, variantIndex: number): RankedLookupResponse {
  if (!response.encontrado || !response.results?.length) {
    return {
      response,
      variant,
      variantIndex,
      isFullVariant: normalizeLookupText(variant) === normalizeLookupText(fullQuery),
      topMetrics: null,
    };
  }

  const rankedResults = response.results
    .map(result => {
      const metrics = getBestLookupCandidateMetrics(result, fullQuery);
      return {
        result: {
          ...result,
          matchType: metrics.matchType,
        },
        metrics,
      };
    })
    .sort((a, b) => compareLookupCandidateMetrics(a.metrics, b.metrics));

  return {
    response: {
      ...response,
      results: rankedResults.map(entry => entry.result),
    },
    variant,
    variantIndex,
    isFullVariant: normalizeLookupText(variant) === normalizeLookupText(fullQuery),
    topMetrics: rankedResults[0]?.metrics ?? null,
  };
}

function compareRankedLookupResponses(a: RankedLookupResponse, b: RankedLookupResponse): number {
  if (a.response.encontrado && !b.response.encontrado) return -1;
  if (!a.response.encontrado && b.response.encontrado) return 1;

  if (a.response.encontrado && b.response.encontrado) {
    if (a.topMetrics && b.topMetrics) {
      const metricsDiff = compareLookupCandidateMetrics(a.topMetrics, b.topMetrics);
      if (metricsDiff !== 0) return metricsDiff;
    }

    if (a.isFullVariant !== b.isFullVariant) return a.isFullVariant ? -1 : 1;

    const totalA = a.response.total ?? 0;
    const totalB = b.response.total ?? 0;
    if (totalA !== totalB) return totalA - totalB;
  }

  return a.variantIndex - b.variantIndex;
}

export async function lookupCliente(nomeEmpresa: string): Promise<LookupResponse> {
  if (shouldLogLookupDebug) {
    scoutDiag.debug('Lookup', 'início da consulta de cliente');
  }

  const nomeLimpo = stripLookupNoise(nomeEmpresa)
    .replace(/,\s*/g, ' ')   // vírgula vira espaço ("SENIOR, TOTVS" → "SENIOR TOTVS")
    .replace(/[.;:!?]+$/, '')
    .trim()
    .replace(/\s+/g, ' ');   // normaliza espaços múltiplos

  const cacheKey = normalizeCacheKey(nomeEmpresa);

  // Cache permanente (encontrado=true) — retorna imediatamente
  if (_lookupCache.has(cacheKey)) {
    if (shouldLogLookupDebug) {
      scoutDiag.debug('Lookup', 'cache hit permanente', {
        cacheKey: truncateForDiag(cacheKey),
      });
    }
    return _lookupCache.get(cacheKey)!;
  }

  // Cache temporário de "não encontrado" — respeita TTL de 30s
  const notFoundEntry = _notFoundCache.get(cacheKey);
  if (notFoundEntry) {
    if (Date.now() < notFoundEntry.expiresAt) {
      if (shouldLogLookupDebug) {
        scoutDiag.debug('Lookup', 'cache hit not-found TTL', {
          cacheKey: truncateForDiag(cacheKey),
        });
      }
      return notFoundEntry.data;
    }
    _notFoundCache.delete(cacheKey);
    if (shouldLogLookupDebug) {
      scoutDiag.debug('Lookup', 'cache not-found expirado', {
        cacheKey: truncateForDiag(cacheKey),
      });
    }
  }

  if (shouldLogLookupDebug) {
    scoutDiag.debug('Lookup', 'query normalizada', {
      query: truncateForDiag(nomeLimpo, 120),
    });
  }

  try {
    const p1 = nomeLimpo.includes(' ')
      ? nomeLimpo.split(/\s+/).filter(p => p.length > 2)[0] ?? null
      : null;
    
    // Se p1 for um prefixo genérico (ex: "FUNDACAO"), não usamos como variante de busca isolada
    const isP1Generic = p1 ? isGenericLookupPrefixToken(p1) : false;

    const words = nomeLimpo.split(/\s+/).filter(w => w.length > 3);
    
    // Pick the longest word that is NOT a generic prefix
    const nonGenericWords = words.filter(w => !isGenericLookupPrefixToken(w));
    const strongest = nonGenericWords.length > 0
      ? [...nonGenericWords].sort((a, b) => b.length - a.length)[0]
      : null;

    const variants: string[] = [nomeLimpo];
    if (p1 && p1 !== nomeLimpo && !isP1Generic) variants.push(p1);
    if (strongest && strongest !== nomeLimpo && strongest !== p1) variants.push(strongest);

    const settled = await Promise.allSettled(variants.map(v => fetchLookup(v)));

    const rankedResponses = settled
      .map((result, index) => {
        if (result.status !== 'fulfilled') return null;
        return rankLookupResponse(result.value, nomeLimpo, variants[index], index);
      })
      .filter((result): result is RankedLookupResponse => Boolean(result))
      .sort(compareRankedLookupResponses);

    // Lógica de seleção aprimorada:
    // 1. Prioriza resultados encontrados.
    // 2. Entre os encontrados, prioriza aquele que contém o nomeLimpo original no grupo ou razoes_sociais.
    // 3. Se empatar, usa o total de resultados como desempate (mais específico geralmente tem menos resultados).

    // Atribui matchType baseado na precisão
    const data: LookupResponse = rankedResponses[0]?.response
      ? {
          ...rankedResponses[0].response,
          query: nomeLimpo,
        }
      : {
          ok: false,
          query: nomeLimpo,
          encontrado: false,
          total: 0,
          results: [],
        };

    if (shouldLogLookupDebug) {
      scoutDiag.debug('Lookup', 'resultado da consulta', {
        found: data.encontrado,
        total: data.total,
      });
    }

    if (data.encontrado) {
      _lookupCache.set(cacheKey, data);
    } else {
      _notFoundCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + NOT_FOUND_TTL_MS,
      });
    }

    return data;
  } catch (err: any) {
    scoutDiag.error("Lookup", "exceção em lookupCliente", {
      query: nomeEmpresa.slice(0, 120),
      error: String(err?.message || err),
    });
    return { ok: false, query: nomeEmpresa, encontrado: false, total: 0, results: [], error: String(err) };
  }
}

async function fetchLookup(query: string): Promise<LookupResponse> {
  const url = `${LOOKUP_API_URL}?q=${encodeURIComponent(query)}`;

  try {
    const resp = await fetchWithRetry(url);
    if (!resp.ok) {
      scoutDiag.warn("Lookup", "HTTP não OK na planilha (Apps Script)", {
        query: query.slice(0, 80),
        status: resp.status,
      });
      return { ok: false, query, encontrado: false, total: 0, results: [], error: `HTTP ${resp.status}` };
    }

    const text = await resp.text();
    if (shouldLogLookupDebug) {
      scoutDiag.debug('Lookup', 'preview de resposta', {
        preview: text.slice(0, 100),
      });
    }

    try {
      return JSON.parse(text);
    } catch {
      const err = "JSON parse error";
      scoutDiag.warn("Lookup", "resposta não é JSON válido", {
        query: query.slice(0, 80),
        preview: text.slice(0, 120),
      });
      return { ok: false, query, encontrado: false, total: 0, results: [], error: err };
    }
  } catch (err: any) {
    scoutDiag.warn("Lookup", "fetchLookup falhou", {
      query: query.slice(0, 80),
      error: err?.message || String(err),
    });
    return { ok: false, query, encontrado: false, total: 0, results: [], error: err.message };
  }
}

export function formatarParaPrompt(lookup: LookupResponse): string {
  if (!lookup?.ok || !lookup.encontrado || !lookup.results?.length) {
    return `\n\n---\n## 🔍 BASE INTERNA SENIOR\n**Status:** Empresa "${lookup?.query || ''}" NÃO encontrada na base de clientes Senior.\n**Implicação:** Provável prospect novo (não é cliente atual).\n---\n`;
  }

  const r = lookup.results[0];
  const effectiveMatchType = r.matchType ?? getBestLookupCandidateMetrics(r, lookup.query).matchType;
  const isExact = effectiveMatchType === 'exact';

  let md = `\n\n---\n## 🔍 BASE INTERNA SENIOR ${isExact ? '[🟢 CONFIRMADO — dados CRM interno Senior]' : '[🟡 POSSÍVEL MATCH — verificar precisão]'}\n`;
  if (!isExact) {
    md += `**Atenção:** Busca retornou dados de um grupo similar. Valide se "${r.grupo}" corresponde à "${lookup.query}".\n\n`;
  }
  md += `**Grupo Cliente:** ${r.grupo}\n`;
  md += `**Status CRM:** ${isExact ? 'Confirmado' : 'Possivel match'}\n`;
  md += `**É cliente Senior:** ✅ SIM\n`;
  md += `**Total módulos contratados:** ${r.total_modulos}\n\n`;

  md += `### Soluções Senior contratadas:\n`;
  if (r.modulos_por_familia) {
    const icons: Record<string, string> = { "GATec": "🌾", "ERP": "💼", "HCM": "👥", "Logística": "🚛", "Acesso": "🔐", "Plataforma": "📚", "Hypnobox": "🏠" };
    for (const [fam, mods] of Object.entries(r.modulos_por_familia)) {
      if (fam === "Infra" || fam === "Outros") continue;
      md += `${icons[fam] || "📦"} **${fam}:** ${Array.isArray(mods) ? mods.join(", ") : mods}\n`;
    }
  }

  if (r.gaps_crosssell?.length) {
    md += `\n### ⚡ GAPS — Oportunidade de cross-sell:\n`;
    const dicas: Record<string, string> = {
      "GATec": "SEM gestão agrícola Senior — oportunidade QUENTE se for agro",
      "ERP": "SEM ERP Senior — possível consolidação",
      "HCM": "SEM gestão de pessoas Senior — verificar porte",
      "Logística": "SEM WMS/TMS Senior — verificar operação",
      "Acesso": "SEM Ronda/controle de acesso",
      "Plataforma": "SEM Konviva/Painel"
    };
    for (const gap of r.gaps_crosssell) {
      md += `- **${gap}:** ${dicas[gap] || `Não possui ${gap}`}\n`;
    }
  }

  md += `\n**⚠️ INSTRUÇÃO:** Estes dados são 🟢 CONFIRMADO (CRM interno). Os GAPS DEVEM guiar a FASE 8.\n---\n`;
  if (!isExact) {
    md += `\n**INSTRUCAO:** Trate estes dados apenas como pista comercial. Nao use este bloco como confirmacao de cliente Senior sem validacao adicional.\n---\n`;
  }
  md = isExact
    ? md
    : md
        .replace(/\n\*\*.*cliente Senior:.*\n/g, '\n')
        .replace(/\n\*\*.*CRM interno\)\. Os GAPS DEVEM guiar a FASE 8\.\n---\n/g, '');
  return md;
}

// Benchmark
export interface BenchmarkResponse {
  ok: boolean;
  mode: string;
  keywords: string | string[];
  total: number;
  results: ClienteResult[];
  error?: string;
}

export async function benchmarkClientes(keywords: string | string[]): Promise<BenchmarkResponse> {
  const kw = Array.isArray(keywords) ? keywords.join(',') : keywords;
  const url = `${LOOKUP_API_URL}?mode=benchmark&keywords=${encodeURIComponent(kw)}`;

  // FIX: Apps Script pode retornar HTML (cold start) na primeira chamada.
  // Tentamos parsear o JSON e, se falhar, aguardamos COLD_START_RETRY_DELAY_MS e
  // fazemos uma segunda tentativa antes de registrar erro.
  const attemptParse = async (): Promise<BenchmarkResponse> => {
    const resp = await fetchWithRetry(url);
    if (!resp.ok) {
      scoutDiag.warn("Benchmark", "HTTP não OK no benchmark", { status: resp.status, kw: kw.slice(0, 80) });
      return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: `HTTP ${resp.status}` };
    }
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      // Sinal de cold start — Apps Script retornou HTML em vez de JSON
      scoutDiag.warn("Benchmark", "JSON parse falhou (possível cold start) — aguardando retry", {
        kw: kw.slice(0, 80),
        preview: text.slice(0, 120),
      });
      throw new Error("JSON_PARSE_FAILED");
    }
  };

  try {
    return await attemptParse();
  } catch (firstErr: any) {
    if (firstErr?.message === "JSON_PARSE_FAILED") {
      // Cold start detectado — aguarda o Apps Script aquecer e tenta uma vez mais
      await new Promise(resolve => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
      try {
        return await attemptParse();
      } catch (retryErr: any) {
        scoutDiag.error("Benchmark", "benchmark falhou após retry de cold start", {
          error: String(retryErr?.message || retryErr),
        });
        return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: String(retryErr) };
      }
    }
    scoutDiag.error("Benchmark", "exceção em benchmarkClientes", { error: String(firstErr?.message || firstErr) });
    return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: String(firstErr) };
  }
}

export function formatarBenchmarkParaPrompt(bench: BenchmarkResponse, empresaAlvo: string): string {
  if (!bench?.ok || !bench.results?.length) {
    // FIX: fallback visual informativo ao invés de bloco vazio silencioso
    const motivo = bench?.error === 'JSON_PARSE_FAILED'
      ? 'Benchmark sendo processado — tente novamente em instantes.'
      : 'Nenhum cliente Senior encontrado com operação similar.';
    return `\n\n---\n## 🏷️ BENCHMARK SENIOR\n_${motivo}_\n---\n`;
  }

  let md = `\n\n---\n## 🏷️ BENCHMARK SENIOR [🟢 CONFIRMADO]\n`;
  md += `**Encontrados:** ${bench.total} clientes Senior similares\n\n`;

  const top = bench.results.slice(0, 5);
  for (const r of top) {
    md += `### 📌 ${r.grupo}\n`;
    md += `- **Soluções:** ${r.familias_presentes.join(', ')} (${r.total_modulos} mód.)\n`;
  }

  md += `\n---\n`;
  return md;
}

// Comex Stat
export function formatarComexParaPrompt(comexData: any): string {
  if (!comexData || !comexData.isExportador) return '';

  let md = `\n\n---\n## 🚢 COMEX STAT MDIC [🟢 CONFIRMADO]\n`;
  md += `**Status:** Exportador Ativo\n`;
  if (comexData.faixaValorEstimado) {
    md += `**Faixa de Exportação:** ${comexData.faixaValorEstimado}\n`;
  }
  if (comexData.principaisNCMs && comexData.principaisNCMs.length > 0) {
    md += `**Principais Produtos (NCM):** ${comexData.principaisNCMs.join(', ')}\n`;
  }
  
  md += `\n**⚠️ INSTRUÇÃO (SCORE PORTA):** \n- A presença deste dado de exportação CONFIRMADA oficial do MDIC **AUMENTA A NOTA DA DIMENSÃO O (Operação)**. Considere a complexidade logística e aduaneira na análise.\n- É OBRIGATÓRIO recomendar o módulo **Commerce Log** na Fase 8 como fit perfeito para essa operação de exportação. Se os produtos envolverem grãos/commodities, recomendar também o **OneClick**.\n---\n`;

  return md;
}
