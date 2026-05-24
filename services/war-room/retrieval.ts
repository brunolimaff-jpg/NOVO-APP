import type { RagResult } from '../ragService';
import { buscarContextoDocsPinecone, buscarContextoPinecone } from '../ragService';
import {
  COMPETITOR_DOCS_NAMESPACE,
  DEFAULT_DOCS_NAMESPACE,
  DOCS_CACHE_TTL_MS,
  ERP_BANKING_REFERENCE_BLOCK,
  FERCUS_REFERENCE_BLOCK,
  GATEC_AGRICOLA_REFERENCE_BLOCK,
  MAX_DOCS_CHARS,
  TALHAO_REFERENCE_BLOCK,
} from './config';
import { trimText } from './history';
import type { WarRoomDocsContextResult, WarRoomIntentFlags, WarRoomMode } from './contracts';

type DocsCacheEntry = {
  value: string;
  expiresAt: number;
};

type RagResponseLike = RagResult | string | null | undefined;

const docsCache = new Map<string, DocsCacheEntry>();
const docsInflight = new Map<string, Promise<string>>();
const globalCache = new Map<string, DocsCacheEntry>();
const globalInflight = new Map<string, Promise<string>>();

type SettledStringResult = PromiseSettledResult<string>;

function normalizeRagResponse(result: RagResponseLike): RagResult {
  if (typeof result === 'string') {
    return { context: result, failed: false };
  }

  return {
    context: result?.context || '',
    failed: Boolean(result?.failed),
  };
}

async function getDocsContextCached(query: string, namespace: string = DEFAULT_DOCS_NAMESPACE): Promise<string> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return '';

  const key = `${namespace}::${normalizedQuery}`;
  const now = Date.now();
  const cached = docsCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = docsInflight.get(key);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    try {
      const rawResult = await buscarContextoDocsPinecone(query, namespace);
      const result = normalizeRagResponse(rawResult);
      if (result.failed) {
        console.warn(`[WarRoom][Pinecone Docs] RAG falhou — namespace="${namespace}", query="${query.slice(0, 80)}"`);
      }

      const clean = trimText(result.context || '', MAX_DOCS_CHARS);
      docsCache.set(key, { value: clean, expiresAt: Date.now() + DOCS_CACHE_TTL_MS });
      return clean;
    } catch (error) {
      docsCache.delete(key);
      throw error;
    } finally {
      docsInflight.delete(key);
    }
  })();

  docsInflight.set(key, fetchPromise);
  return fetchPromise;
}

async function getGlobalContextCached(query: string): Promise<string> {
  const key = query.trim().toLowerCase();
  if (!key) return '';

  const now = Date.now();
  const cached = globalCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = globalInflight.get(key);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    try {
      const rawResult = await buscarContextoPinecone(query);
      const result = normalizeRagResponse(rawResult);
      if (result.failed) {
        console.warn(`[WarRoom][Pinecone Global] RAG falhou — query="${query.slice(0, 80)}"`);
      }

      const clean = trimText(result.context || '', MAX_DOCS_CHARS);
      globalCache.set(key, { value: clean, expiresAt: Date.now() + DOCS_CACHE_TTL_MS });
      return clean;
    } catch (error) {
      globalCache.delete(key);
      throw error;
    } finally {
      globalInflight.delete(key);
    }
  })();

  globalInflight.set(key, fetchPromise);
  return fetchPromise;
}

export function mergeDocContexts(contexts: string[]): string {
  const blocks = contexts
    .flatMap((ctx) => ctx.split(/\n\n---\n\n/g))
    .map((block) => block.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const block of blocks) {
    if (seen.has(block)) continue;
    seen.add(block);
    unique.push(block);
  }

  return trimText(unique.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

export function filterDocsForProcessoAgricola(context: string): string {
  if (!context.trim()) return context;

  const blocks = context.split(/\n\n---\n\n/g);
  const kept = blocks.filter((block) => {
    const lower = block.toLowerCase();
    const isIntegracaoBlock =
      lower.includes('integracao gatec') ||
      lower.includes('integração gatec') ||
      lower.includes('processos-integracao-gatec') ||
      lower.includes('hcm-integracao-gatec');
    const isAgricolaBlock =
      lower.includes('simplefarm') ||
      lower.includes('agricola') ||
      lower.includes('agrícola') ||
      lower.includes('ordem de serviço') ||
      lower.includes('safra') ||
      lower.includes('cultura') ||
      lower.includes('talhão') ||
      lower.includes('irrigação') ||
      lower.includes('monitoramento');

    if (isAgricolaBlock) return true;
    return !isIntegracaoBlock;
  });

  return trimText(kept.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

export function filterNoisyDocsContext(
  context: string,
  options: { processoAgricola: boolean; fercus: boolean },
): string {
  if (!context.trim()) return context;

  const blocks = context.split(/\n\n---\n\n/g);
  const kept = blocks.filter((block) => {
    const lower = block.toLowerCase();

    if (lower.includes('404 - página não encontrada') || lower.includes('404 - pagina nao encontrada')) {
      return false;
    }

    if (
      options.fercus &&
      (lower.includes('/gestao-de-pessoas-hcm/6.10.4/customizacoes/') ||
        lower.includes('categoria: customizações') ||
        lower.includes('categoria: customizacoes'))
    ) {
      return false;
    }

    if (
      options.processoAgricola &&
      !options.fercus &&
      (lower.includes('/seniorxplatform/manual-do-usuario/') ||
        lower.includes('categoria: customizações') ||
        lower.includes('categoria: customizacoes'))
    ) {
      return false;
    }

    return true;
  });

  return trimText(kept.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

export function prioritizeBlocksByKeywords(context: string, keywords: string[]): string {
  if (!context.trim() || keywords.length === 0) return context;

  const blocks = context.split(/\n\n---\n\n/g).filter(Boolean);
  const scored = blocks.map((block) => {
    const lower = block.toLowerCase();
    const score = keywords.reduce(
      (accumulator, keyword) => (lower.includes(keyword.toLowerCase()) ? accumulator + 1 : accumulator),
      0,
    );

    return { block, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return trimText(scored.map((item) => item.block).join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

function pickFulfilledValues(results: SettledStringResult[], onRejected: (reason: unknown) => void): string[] {
  return results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return result.value ? [result.value] : [];
    }

    onRejected(result.reason);
    return [];
  });
}

export async function loadWarRoomDocsContext(
  mode: WarRoomMode,
  message: string,
  flags: WarRoomIntentFlags,
  onStatus?: (status: string) => void,
): Promise<WarRoomDocsContextResult> {
  let docsContext = '';
  let docsUnavailable = false;

  if (mode !== 'tech' && mode !== 'benchmark') {
    return { docsContext, docsUnavailable };
  }

  onStatus?.('📚 Consultando Pinecone (docs + base interna)...');

  try {
    const queries: string[] = [message];
    if (flags.wantsProcessoAgricola && !flags.wantsIntegracao) {
      queries.unshift(
        `${message} simplefarm manual do usuário agrícola ordem de serviço safra culturas monitoramento irrigação`,
      );
    }
    if (flags.wantsFercus) {
      queries.unshift(`${message} fercus gestão de custos gerenciais gatec módulo fercus`);
    }
    if (flags.wantsTalhao) {
      queries.unshift(
        `${message} agr0193 consulta analítica de talhão agr0192 configuração da consulta analítica de talhão`,
      );
    }
    if (flags.wantsGatecAgricola && !flags.wantsIntegracao) {
      queries.unshift(
        `${message} simplefarm manual do usuário agrícola ordem de serviço culturas safra monitoramento irrigação`,
      );
    }
    if (flags.wantsBanking) {
      queries.unshift(
        `${message} ERP Banking integração bancária pagamentos eletrônicos CNAB TED ACH contas a pagar`,
      );
    }

    const docsNamespaces =
      mode === 'benchmark'
        ? [DEFAULT_DOCS_NAMESPACE, COMPETITOR_DOCS_NAMESPACE]
        : [DEFAULT_DOCS_NAMESPACE];

    const [docsContextsSettled, globalContextsSettled] = await Promise.all([
      Promise.allSettled(
        queries.flatMap((query) => docsNamespaces.map((namespace) => getDocsContextCached(query, namespace))),
      ),
      Promise.allSettled(queries.map((query) => getGlobalContextCached(query))),
    ]);

    let hadRagFailure = false;
    const reportSettledFailure = (reason: unknown) => {
      hadRagFailure = true;
      const details = reason instanceof Error ? reason.message : String(reason);
      console.warn('[WarRoom][Pinecone] Falha parcial no bloco RAG:', details);
    };

    const docsContexts = pickFulfilledValues(docsContextsSettled, reportSettledFailure);
    const globalContexts = pickFulfilledValues(globalContextsSettled, reportSettledFailure);

    docsContext = mergeDocContexts([...docsContexts, ...globalContexts]);

    if (flags.wantsProcessoAgricola && !flags.wantsIntegracao) {
      docsContext = filterDocsForProcessoAgricola(docsContext);
    }

    docsContext = filterNoisyDocsContext(docsContext, {
      processoAgricola: flags.wantsProcessoAgricola,
      fercus: flags.wantsFercus,
    });

    if (flags.wantsFercus && docsContext && !/gatec-modulo-fercus/i.test(docsContext)) {
      docsContext = mergeDocContexts([FERCUS_REFERENCE_BLOCK, docsContext]);
    }

    if (flags.wantsTalhao && docsContext && !/consulta-analitica-de-talhao/i.test(docsContext)) {
      docsContext = mergeDocContexts([TALHAO_REFERENCE_BLOCK, docsContext]);
    }

    if (flags.wantsGatecAgricola && docsContext && !/simplefarm\/manual-do-usuario\/agricola/i.test(docsContext)) {
      docsContext = mergeDocContexts([GATEC_AGRICOLA_REFERENCE_BLOCK, docsContext]);
    }

    if (flags.wantsBanking && docsContext && !/integracao-erp-banking/i.test(docsContext)) {
      docsContext = mergeDocContexts([ERP_BANKING_REFERENCE_BLOCK, docsContext]);
    }

    if (flags.wantsFercus) {
      docsContext = prioritizeBlocksByKeywords(docsContext, ['gatec-modulo-fercus', 'custos gerenciais']);
    }

    if (flags.wantsGatecAgricola && !flags.wantsIntegracao) {
      docsContext = prioritizeBlocksByKeywords(docsContext, [
        '/simplefarm/manual-do-usuario/agricola/',
        'ordem de serviço',
        'safra',
        'culturas',
        'consulta analítica de talhão',
      ]);
    }

    if (flags.wantsBanking) {
      docsContext = prioritizeBlocksByKeywords(docsContext, [
        'integracao-erp-banking',
        '#banking/banking.htm',
        'integração bancária',
        'cnab',
        'pagamento eletrônico',
      ]);
    }

    if (!docsContext) {
      docsUnavailable = true;
      onStatus?.('⚠️ Pinecone indisponível — usando conhecimento complementar.');
    } else if (hadRagFailure) {
      docsUnavailable = true;
      onStatus?.('⚠️ Pinecone respondeu parcialmente — continuando com contexto parcial.');
    }
  } catch (error: unknown) {
    docsUnavailable = true;
    const details = error instanceof Error ? error.message : String(error);
    console.error('[WarRoom][Pinecone] Falha crítica no bloco RAG:', details);
    onStatus?.('⚠️ Falha ao consultar Pinecone — continuando sem RAG.');
  }

  return { docsContext, docsUnavailable };
}
