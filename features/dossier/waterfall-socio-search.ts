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

export interface WaterfallSocioSearchParams {
  partners: Array<{ name: string }>;
  rootCompanyName: string;
  rootCnpj?: string;
  operatorId?: string;
  signal: AbortSignal;
}

export interface WaterfallSocioSearchResult {
  text: string;
  discoveredCnpjs: string[];
  partnersSearched: number;
  companiesFound: number;
  degraded: boolean;
}

function mergeAbortSignals(primary: AbortSignal, timeoutMs: number): AbortSignal {
  const merged = new AbortController();
  const abortMerged = () => merged.abort();
  if (primary.aborted) {
    abortMerged();
    return merged.signal;
  }
  primary.addEventListener('abort', abortMerged, { once: true });
  if (typeof AbortSignal.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    timeoutSignal.addEventListener('abort', abortMerged, { once: true });
  } else {
    setTimeout(abortMerged, timeoutMs);
  }
  return merged.signal;
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
  signal: AbortSignal;
}): Promise<SocioSearchResponse> {
  const fetchSignal = mergeAbortSignals(params.signal, SOCIO_SEARCH_CLIENT_TIMEOUT_MS);
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

  const startedAt = Date.now();
  scoutDiag.info('TeiaSocietaria', 'socio-search waterfall iniciado', {
    rootCompanyName: params.rootCompanyName,
    rootCnpj: params.rootCnpj,
    partnersCount: partners.length,
  });

  for (let index = 0; index < partners.length; index += SOCIO_SEARCH_BATCH_SIZE) {
    if (params.signal.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS) {
      degraded = true;
      const remaining = partners.slice(index);
      scoutDiag.warn('TeiaSocietaria', 'socio-search waterfall interrompido por cap agregado', {
        rootCompanyName: params.rootCompanyName,
        elapsedMs,
        capMs: WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS,
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
    const batchResults = await Promise.all(
      batch.map(async partner => {
        try {
          const payload = await fetchSocioSearchPartner({
            partnerName: partner.name,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: params.rootCnpj,
            operatorId: params.operatorId,
            signal: params.signal,
          });
          const companies = payload.companies || [];
          if (payload.degraded) degraded = true;
          return {
            partnerName: partner.name,
            companies,
            degraded: payload.degraded,
          };
        } catch (error) {
          if (isAbortLikeError(error)) throw error;
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
