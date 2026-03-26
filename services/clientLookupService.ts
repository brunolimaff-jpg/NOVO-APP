// services/clientLookupService.ts
// CORRIGIDO: Timeout + Retry para App Script

import { LOOKUP_URL } from "./apiConfig";
import { CONCORRENTES } from "./competitors";
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

const LOOKUP_API_URL = LOOKUP_URL;
const TIMEOUT_MS = 15000; // 15 segundos (Apps Script cold start pode demorar)
const MAX_RETRIES = 3;
const shouldLogLookupDebug = import.meta.env?.VITE_VERBOSE_LOGS === 'true';

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
      throw new Error(`Timeout após ${timeout / 1000}s`);
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
        console.log(`[LOOKUP] Tentativa ${attempt}/${retries}: ${url.substring(0, 80)}...`);
      }
      const response = await fetchWithTimeout(url);
      if (shouldLogLookupDebug) {
        console.log(`[LOOKUP] Sucesso na tentativa ${attempt}`);
      }
      return response;
    } catch (err: any) {
      lastError = err;
      if (shouldLogLookupDebug) {
        console.warn(`[LOOKUP] Tentativa ${attempt} falhou:`, err.message);
      }

      if (attempt < retries) {
        // Backoff exponencial: 1s, 2s, 4s
        const wait = 1000 * Math.pow(2, attempt - 1);
        if (shouldLogLookupDebug) {
          console.log(`[LOOKUP] Aguardando ${wait / 1000}s antes de tentar novamente...`);
        }
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  throw lastError || new Error('Falha após todas as tentativas');
}

// Cache em memória por sessão — evita requests duplicados para o mesmo nome
const _lookupCache = new Map<string, LookupResponse>();

function normalizeCacheKey(name: string): string {
  return name
    .replace(/^(grupo|empresa|fazenda|usina|cia)\s+/i, '')
    .replace(/\s+(ltda|s\/a|sa|eireli|me|epp)\.?$/i, '')
    .replace(/[.,;:!?]+$/, '')
    .trim()
    .toLowerCase();
}

export async function lookupCliente(nomeEmpresa: string): Promise<LookupResponse> {
  if (shouldLogLookupDebug) {
    console.log("[LOOKUP] === INÍCIO ===");
  }

  const nomeLimpo = nomeEmpresa
    .replace(/^(grupo|empresa|fazenda|usina|cia)\s+/i, '')
    .replace(/\s+(ltda|s\/a|sa|eireli|me|epp)\.?$/i, '')
    .replace(/,\s*/g, ' ')   // vírgula vira espaço ("SENIOR, TOTVS" → "SENIOR TOTVS")
    .replace(/[.;:!?]+$/, '')
    .trim()
    .replace(/\s+/g, ' ');   // normaliza espaços múltiplos

  const cacheKey = normalizeCacheKey(nomeEmpresa);

  // Cache hit: retorna imediatamente sem novas chamadas HTTP
  if (_lookupCache.has(cacheKey)) {
    if (shouldLogLookupDebug) {
      console.log("[LOOKUP] Cache hit:", cacheKey);
    }
    return _lookupCache.get(cacheKey)!;
  }

  if (shouldLogLookupDebug) {
    console.log("[LOOKUP] Query:", nomeLimpo);
  }

  try {
    // Monta variantes de busca únicas para disparo paralelo
    const p1 = nomeLimpo.includes(' ')
      ? nomeLimpo.split(/\s+/).filter(p => p.length > 2)[0] ?? null
      : null;
    const words = nomeLimpo.split(/\s+/).filter(w => w.length > 3);
    const strongest = words.length > 0
      ? [...words].sort((a, b) => b.length - a.length)[0]
      : null;

    const variants: string[] = [nomeLimpo];
    if (p1 && p1 !== nomeLimpo) variants.push(p1);
    if (strongest && strongest !== nomeLimpo && strongest !== p1) variants.push(strongest);

    // Dispara todas as variantes em paralelo (substitui 3 chamadas sequenciais)
    const settled = await Promise.allSettled(variants.map(v => fetchLookup(v)));

    // Usa o primeiro resultado com encontrado=true, senão o primeiro disponível
    const found = settled.find(
      (r): r is PromiseFulfilledResult<LookupResponse> =>
        r.status === 'fulfilled' && r.value.encontrado
    );

    const data = found
      ? found.value
      : settled[0].status === 'fulfilled'
        ? settled[0].value
        : { ok: false, query: nomeLimpo, encontrado: false, total: 0, results: [] };

    if (shouldLogLookupDebug) {
      console.log("[LOOKUP] Resultado:", data.encontrado ? "ENCONTRADO ✅" : "NÃO ENCONTRADO", "| Total:", data.total);
    }
    _lookupCache.set(cacheKey, data);
    return data;
  } catch (err: any) {
    if (shouldLogLookupDebug) {
      console.error("[LOOKUP] ERRO:", err.message);
    }
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
      console.log("[LOOKUP] Response:", text.substring(0, 100));
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

  let md = `\n\n---\n## 🔍 BASE INTERNA SENIOR [🟢 CONFIRMADO — dados CRM interno Senior]\n`;
  md += `**Grupo Cliente:** ${r.grupo}\n`;
  md += `**É cliente Senior:** ✅ SIM — CONFIRMADO na base interna\n`;
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
  return md;
}

// Benchmark
export interface BenchmarkResponse {
  ok: boolean;
  mode: string;
  keywords: string[];
  total: number;
  results: ClienteResult[];
  error?: string;
}

export async function benchmarkClientes(keywords: string[]): Promise<BenchmarkResponse> {
  try {
    const kw = keywords.join(',');
    const url = `${LOOKUP_API_URL}?mode=benchmark&keywords=${encodeURIComponent(kw)}`;

    const resp = await fetchWithRetry(url);
    if (!resp.ok) {
      scoutDiag.warn("Benchmark", "HTTP não OK no benchmark", { status: resp.status, kw: kw.slice(0, 80) });
      return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: `HTTP ${resp.status}` };
    }

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      scoutDiag.warn("Benchmark", "JSON parse falhou", { kw: kw.slice(0, 80), preview: text.slice(0, 120) });
      return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: "JSON parse" };
    }
  } catch (err: any) {
    scoutDiag.error("Benchmark", "exceção em benchmarkClientes", { error: String(err?.message || err) });
    return { ok: false, mode: 'benchmark', keywords, total: 0, results: [], error: String(err) };
  }
}

export function formatarBenchmarkParaPrompt(bench: BenchmarkResponse, empresaAlvo: string): string {
  if (!bench?.ok || !bench.results?.length) {
    return `\n\n---\n## 🏭 BENCHMARK SENIOR\nNenhum cliente Senior encontrado com operação similar a "${empresaAlvo}".\n---\n`;
  }

  let md = `\n\n---\n## 🏭 BENCHMARK SENIOR [🟢 CONFIRMADO]\n`;
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
  
  md += `\n**⚠️ INSTRUÇÃO (SCORE PORTA):** 
- A presença deste dado de exportação CONFIRMADA oficial do MDIC **AUMENTA A NOTA DA DIMENSÃO O (Operação)**. Considere a complexidade logística e aduaneira na análise.
- É OBRIGATÓRIO recomendar o módulo **Commerce Log** na Fase 8 como fit perfeito para essa operação de exportação. Se os produtos envolverem grãos/commodities, recomendar também o **OneClick**.
---\n`;

  return md;
}
