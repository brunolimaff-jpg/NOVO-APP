import type { SocietaryCompanyInput } from './societaryGraph.types';
import { formatSocietaryCnpj } from './societaryGraph';
import {
  SOCIO_SEARCH_BATCH_SIZE,
  SOCIO_SEARCH_CLIENT_TIMEOUT_MS,
  type SocioSearchResponse,
} from './SocietaryMap/utils';
import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj';
import { scoutDiag } from '../../utils/diagnosticLog';
import { isAbortLikeError } from '../../utils/abortHelpers';

const MAX_WATERFALL_SOCIO_PARTNERS = 12;

/**
 * Teto agregado da fase socio-search no waterfall preview.
 * Sem cap: até 12 sócios × 52s/lote ≈ 312s — consome quase todo WATERFALL_HARD_CAP_MS (330s).
 * Scheffer (~3-4 sócios, 2 lotes) cabe em ~52s; sobra ~230s para módulos do dossiê.
 */
export const WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS = 100_000;

/** Cap agregado menor no experimento LiteLLM — prioriza chegar ao loop de módulos. */
export const WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS_LITE_LLM = 18_000;

/** Timeout por sócio no LiteLLM — abaixo do teto de 52s que abortava o waterfall inteiro. */
export const WATERFALL_SOCIO_SEARCH_PARTNER_TIMEOUT_MS_LITE_LLM = 8_000;

export interface WaterfallSocioSearchParams {
  partners: Array<{ name: string }>;
  rootCompanyName: string;
  rootCnpj?: string;
  operatorId?: string;
  signal: AbortSignal;
  /** Reduz caps e degrada em timeout de fetch (não propaga abort ao loop principal). */
  liteLLMExperiment?: boolean;
}

export interface WaterfallSocioSearchResult {
  text: string;
  discoveredCnpjs: string[];
  partnersSearched: number;
  companiesFound: number;
  degraded: boolean;
}

function createPartnerFetchTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function resolveSocioSearchBudget(params: WaterfallSocioSearchParams): {
  aggregateCapMs: number;
  partnerTimeoutMs: number;
} {
  if (params.liteLLMExperiment) {
    return {
      aggregateCapMs: WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS_LITE_LLM,
      partnerTimeoutMs: WATERFALL_SOCIO_SEARCH_PARTNER_TIMEOUT_MS_LITE_LLM,
    };
  }
  return {
    aggregateCapMs: WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS,
    partnerTimeoutMs: SOCIO_SEARCH_CLIENT_TIMEOUT_MS,
  };
}

function describeScopeForPrompt(company: SocietaryCompanyInput): string {
  if (company.relationshipScope === 'partner_other_cnpj') return 'Sócio admin';
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') {
    return 'Validação pendente';
  }
  return 'Empresa do grupo';
}

function formatCompanyLine(company: SocietaryCompanyInput): string {
  const normalized = company.cnpj ? normalizeCnpj(company.cnpj) : '';
  const cnpjLabel =
    normalized.length === 14 && isValidCnpj(normalized)
      ? formatSocietaryCnpj(normalized)
      : company.rawCnpjLabel || undefined;
  const parts = [
    company.name,
    cnpjLabel ? `CNPJ: ${cnpjLabel}` : null,
    company.country && company.country !== 'BR' ? `País: ${company.country}` : null,
    `Escopo: ${describeScopeForPrompt(company)}`,
    company.confidence ? `Confiança: ${company.confidence}` : null,
    company.role ? `Qualificação: ${company.role}` : null,
  ].filter(Boolean);
  return `- ${parts.join(' | ')}`;
}

export function formatSocioSearchPartnerBlock(
  partnerName: string,
  companies: SocietaryCompanyInput[],
  options?: { degraded?: boolean },
): string {
  const header = `Sócio: ${partnerName}`;
  if (companies.length === 0) {
    return options?.degraded
      ? `${header}\n- (busca degradada ou sem inventário lateral)`
      : `${header}\n- (nenhuma empresa lateral encontrada)`;
  }
  return [header, ...companies.map(formatCompanyLine)].join('\n');
}

export function buildSocioSearchPromptBlock(
  partnerResults: Array<{
    partnerName: string;
    companies: SocietaryCompanyInput[];
    degraded?: boolean;
  }>,
): string {
  if (partnerResults.length === 0) return '';

  const body = partnerResults
    .map(result => formatSocioSearchPartnerBlock(result.partnerName, result.companies, { degraded: result.degraded }))
    .join('\n\n');

  return [
    '[TEIA SOCIO-SEARCH]',
    'Inventário lateral por sócio (pesquisa server-side pré-módulos). Trate como evidência estruturada — não invente CNPJs além desta lista.',
    '',
    body,
  ].join('\n');
}

function collectDiscoveredCnpjs(companies: SocietaryCompanyInput[]): string[] {
  const discovered = new Set<string>();
  for (const company of companies) {
    const normalized = company.cnpj ? normalizeCnpj(company.cnpj) : '';
    if (normalized.length === 14 && isValidCnpj(normalized)) {
      discovered.add(normalized);
    }
  }
  return [...discovered];
}

async function fetchSocioSearchPartner(params: {
  partnerName: string;
  rootCompanyName: string;
  rootCnpj?: string;
  operatorId?: string;
  partnerTimeoutMs: number;
  degradeOnFetchAbort: boolean;
}): Promise<SocioSearchResponse> {
  const fetchSignal = createPartnerFetchTimeoutSignal(params.partnerTimeoutMs);
  try {
    const response = await fetch('/api/socio-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        socioName: params.partnerName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
        operatorId: params.operatorId,
      }),
      signal: fetchSignal,
    });

    if (!response.ok) {
      scoutDiag.warn('TeiaSocietaria', 'socio-search waterfall HTTP não-OK', {
        partnerName: params.partnerName,
        status: response.status,
        rootCompanyName: params.rootCompanyName,
      });
      return { companies: [], degraded: true };
    }

    return (await response.json()) as SocioSearchResponse;
  } catch (error) {
    if (params.degradeOnFetchAbort && isAbortLikeError(error)) {
      scoutDiag.warn('TeiaSocietaria', 'socio-search waterfall timeout ou abort no fetch — degradando', {
        partnerName: params.partnerName,
        rootCompanyName: params.rootCompanyName,
        partnerTimeoutMs: params.partnerTimeoutMs,
        error: error instanceof Error ? error.message : String(error),
      });
      return { companies: [], degraded: true };
    }
    throw error;
  }
}

export async function buildWaterfallSocioSearchContext(
  params: WaterfallSocioSearchParams,
): Promise<WaterfallSocioSearchResult> {
  const partners = params.partners
    .map(partner => ({ name: partner.name.trim() }))
    .filter(partner => partner.name.length > 0)
    .slice(0, MAX_WATERFALL_SOCIO_PARTNERS);

  if (partners.length === 0 || !params.rootCompanyName.trim()) {
    return {
      text: '',
      discoveredCnpjs: [],
      partnersSearched: 0,
      companiesFound: 0,
      degraded: false,
    };
  }

  const partnerResults: Array<{
    partnerName: string;
    companies: SocietaryCompanyInput[];
    degraded?: boolean;
  }> = [];
  let degraded = false;
  let companiesFound = 0;

  const { aggregateCapMs, partnerTimeoutMs } = resolveSocioSearchBudget(params);
  const degradeOnFetchAbort = Boolean(params.liteLLMExperiment);
  const startedAt = Date.now();
  scoutDiag.info('TeiaSocietaria', 'socio-search waterfall iniciado', {
    rootCompanyName: params.rootCompanyName,
    rootCnpj: params.rootCnpj,
    partnersCount: partners.length,
    liteLLMExperiment: Boolean(params.liteLLMExperiment),
    aggregateCapMs,
    partnerTimeoutMs,
  });

  for (let index = 0; index < partners.length; index += SOCIO_SEARCH_BATCH_SIZE) {
    if (params.signal.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= aggregateCapMs) {
      degraded = true;
      const remaining = partners.slice(index);
      scoutDiag.warn('TeiaSocietaria', 'socio-search waterfall interrompido por cap agregado', {
        rootCompanyName: params.rootCompanyName,
        elapsedMs,
        capMs: aggregateCapMs,
        partnersSkipped: remaining.length,
        partnersCompleted: index,
      });
      for (const partner of remaining) {
        partnerResults.push({
          partnerName: partner.name,
          companies: [],
          degraded: true,
        });
      }
      break;
    }

    const batch = partners.slice(index, index + SOCIO_SEARCH_BATCH_SIZE);
    const batchStartedAt = Date.now();
    const batchResults = await Promise.all(
      batch.map(async partner => {
        try {
          const payload = await fetchSocioSearchPartner({
            partnerName: partner.name,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: params.rootCnpj,
            operatorId: params.operatorId,
            partnerTimeoutMs,
            degradeOnFetchAbort,
          });
          const companies = payload.companies || [];
          if (payload.degraded) degraded = true;
          return {
            partnerName: partner.name,
            companies,
            degraded: payload.degraded,
          };
        } catch (error) {
          if (isAbortLikeError(error)) {
            if (params.signal.aborted) throw error;
            if (degradeOnFetchAbort) {
              degraded = true;
              return {
                partnerName: partner.name,
                companies: [],
                degraded: true,
              };
            }
            throw error;
          }
          scoutDiag.warn('TeiaSocietaria', 'socio-search waterfall falhou para sócio', {
            partnerName: partner.name,
            error: error instanceof Error ? error.message : String(error),
          });
          degraded = true;
          return {
            partnerName: partner.name,
            companies: [],
            degraded: true,
          };
        }
      }),
    );

    console.error('[TRACE] socio-search-batch', {
      batchIndex: Math.floor(index / SOCIO_SEARCH_BATCH_SIZE),
      elapsedMs: Date.now() - startedAt,
      batchMs: Date.now() - batchStartedAt,
      partnersInBatch: batch.length,
      signalAborted: params.signal.aborted,
      liteLLMExperiment: Boolean(params.liteLLMExperiment),
      aggregateCapMs,
      partnerTimeoutMs,
    });

    partnerResults.push(...batchResults);
    companiesFound += batchResults.reduce((sum, result) => sum + result.companies.length, 0);
  }

  const discoveredCnpjs = collectDiscoveredCnpjs(partnerResults.flatMap(result => result.companies));
  const text = buildSocioSearchPromptBlock(partnerResults);

  scoutDiag.info('TeiaSocietaria', 'socio-search waterfall concluído', {
    rootCompanyName: params.rootCompanyName,
    partnersSearched: partners.length,
    companiesFound,
    discoveredCnpjs: discoveredCnpjs.length,
    degraded,
    elapsedMs: Date.now() - startedAt,
    blockChars: text.length,
  });

  return {
    text,
    discoveredCnpjs,
    partnersSearched: partners.length,
    companiesFound,
    degraded,
  };
}
