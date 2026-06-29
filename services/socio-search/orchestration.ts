import { z } from 'zod';
import {
  isPessoaJuridica,
  performWebSearch,
  searchCnpjAbertoCompanies,
  searchConsultasocioDirect,
  type CnpjAbertoCompanyResult,
} from '../../utils/documentExtractor.js';
import { sanitizeSensitivePersonalData } from '../../utils/privacy.js';
import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj.js';
import { scoutDiag } from '../../utils/diagnosticLog.js';
import { lookupCnpj } from '../../lib/cnpjLookup.js';
import {
  type SocioSearchCompany,
  type RejectedSocioSearchResult,
  type SocioSearchResponse,
  type SocioSearchDiagnostics,
  type SocioSearchTraceProvider,
  type SocioSearchTraceDiagnostics,
  type SocioSearchCacheSource,
  type SocioSearchSourceDepth,
  SEARCH_DEADLINE_MS,
  MAX_COMPANIES,
  MAX_CNPJ_LOOKUPS,
  CNPJ_LOOKUP_TIMEOUT_MS,
  PAGE_FETCH_LIMIT,
  RequestSchema,
  normalizeText,
  countRejectedByReason,
} from './types.js';
import {
  type SearchBlock,
  splitSearchBlocks,
  extractCnpjs,
  buildPendingCompanyForCnpj,
  buildCnpjAbertoCompany,
  isInactiveRegistrationStatus,
  inferCompanyNameForCnpj,
  hasMeaningfulInferredCompanyName,
  inferCompanyName,
  fetchCandidatePage,
} from './parser.js';
import {
  scoreEvidence,
  isInternational,
  inferEvidenceType,
  sourceLooksSocioCentric,
  scopeForEnrichedCnpj,
  buildQueries,
  officialQsaIncludesSocio,
} from './scoring.js';

export async function runSearch(
  params: z.infer<typeof RequestSchema>,
  traceEnabled = false,
): Promise<SocioSearchResponse> {
  const companies: SocioSearchCompany[] = [];
  const rejected: RejectedSocioSearchResult[] = [];
  const providersTrace: SocioSearchTraceProvider[] = [];
  const seen = new Set<string>();
  const queries = buildQueries(params.socioName, params.rootCompanyName);
  const queriesRun: string[] = [];
  const startedAt = Date.now();
  let degraded = false;
  let truncated = false;
  let truncatedReason: SocioSearchDiagnostics['truncatedReason'];
  let pagesFetched = 0;
  let cnpjsEnriched = 0;
  let cnpjLookupAttempts = 0;
  let searchNoResultCount = 0;
  let searchFailureCount = 0;
  const cnpjsFound = new Set<string>();

  const hasSearchBudget = () => Date.now() - startedAt < SEARCH_DEADLINE_MS;
  const remainingSearchBudget = () => Math.max(0, SEARCH_DEADLINE_MS - (Date.now() - startedAt));
  const markTruncated = (reason: SocioSearchDiagnostics['truncatedReason']) => {
    truncated = true;
    truncatedReason = truncatedReason || reason;
    degraded = true;
  };

  const snapshotCounts = () => ({
    companies: companies.length,
    rejected: rejected.length,
  });

  const traceProvider = (provider: SocioSearchTraceProvider): void => {
    if (!traceEnabled) return;
    providersTrace.push(provider);
  };

  const addCompany = (company: SocioSearchCompany) => {
    const cnpj = normalizeCnpj(company.cnpj || '');
    const key = isValidCnpj(cnpj) ? `cnpj:${cnpj}` : `name:${normalizeText(company.name)}:${company.country || 'BR'}`;
    if (!company.name || seen.has(key)) return;
    seen.add(key);
    companies.push(company);
  };

  const processContentBlocks = async (blocks: SearchBlock[]) => {
    for (const block of blocks) {
      if (!hasSearchBudget() || companies.length >= MAX_COMPANIES) {
        if (companies.length >= MAX_COMPANIES) markTruncated('company_limit');
        else if (companies.length > 0) markTruncated('deadline');
        else degraded = true;
        break;
      }
      let snippet = block.snippet;
      let sourceDepth: SocioSearchSourceDepth = 'search_result';
      let blockCnpjs = extractCnpjs(`${block.title} ${snippet}`);
      const initialEvidence = scoreEvidence({
        title: block.title,
        snippet,
        url: block.url,
        socioName: params.socioName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
        cnpjs: blockCnpjs,
      });

      const shouldFetchPage =
        pagesFetched < PAGE_FETCH_LIMIT &&
        hasSearchBudget() &&
        (blockCnpjs.length === 0 || sourceLooksSocioCentric(block.title, snippet, block.url, params.socioName)) &&
        (initialEvidence.confidence !== 'strong' ||
          /cnpj|qsa|societ|s[oó]cio|participa|holding|quadro/i.test(`${block.title} ${snippet} ${block.url}`));

      if (shouldFetchPage) {
        pagesFetched += 1;
        const pageText = await fetchCandidatePage(block.url);
        if (pageText) {
          snippet = sanitizeSensitivePersonalData([snippet, pageText].filter(Boolean).join('\n'));
          blockCnpjs = extractCnpjs(`${block.title} ${snippet}`);
          sourceDepth = 'page_extract';
        }
      }

      const evidence = scoreEvidence({
        title: block.title,
        snippet,
        url: block.url,
        socioName: params.socioName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
        cnpjs: blockCnpjs,
      });

      if (evidence.confidence === 'weak') {
        rejected.push({
          sourceTitle: block.title,
          sourceUrl: block.url,
          snippet,
          reason: evidence.rejectReason || 'Evidencia fraca.',
        });
        continue;
      }

      const rootCnpjLocal = normalizeCnpj(params.rootCnpj);
      const relatedCnpjs = blockCnpjs.filter(cnpj => cnpj !== rootCnpjLocal);
      for (const cnpj of relatedCnpjs) cnpjsFound.add(cnpj);
      const unseenRelatedCnpjs = relatedCnpjs.filter(cnpj => !seen.has(`cnpj:${cnpj}`));
      if (relatedCnpjs.length > 0 && unseenRelatedCnpjs.length === 0) continue;
      let enrichedAnyCnpj = false;

      for (const cnpj of unseenRelatedCnpjs) {
        if (companies.length >= MAX_COMPANIES) {
          markTruncated('company_limit');
          break;
        }
        const scopedRelationship = scopeForEnrichedCnpj({
          cnpj,
          evidence,
          title: block.title,
          snippet,
          url: block.url,
          socioName: params.socioName,
          rootCnpj: params.rootCnpj,
        });
        const remainingMs = remainingSearchBudget();
        const canTryOfficialLookup = cnpjLookupAttempts < MAX_CNPJ_LOOKUPS && remainingMs >= 1_000;
        if (canTryOfficialLookup)
          try {
            cnpjLookupAttempts += 1;
            const official = await lookupCnpj(cnpj, {
              timeoutMs: Math.min(CNPJ_LOOKUP_TIMEOUT_MS, Math.max(1_000, remainingMs - 500)),
              maxSources: 1,
            });
            cnpjsEnriched += 1;
            const qsaConfirmsSocio = officialQsaIncludesSocio(official.qsa, params.socioName);
            if (qsaConfirmsSocio === false) {
              enrichedAnyCnpj = true;
              rejected.push({
                sourceTitle: block.title,
                sourceUrl: block.url,
                snippet,
                reason: `QSA oficial nao confirma o socio ${params.socioName} neste CNPJ.`,
              });
              continue;
            }
            enrichedAnyCnpj = true;
            const inferredName = inferCompanyNameForCnpj(cnpj, block.title, snippet);
            const officialName = official.companyName?.trim() || '';
            addCompany({
              name: hasMeaningfulInferredCompanyName(officialName) ? officialName : inferredName,
              cnpj,
              partnerName: params.socioName,
              sourceTitle: block.title,
              sourceUrl: block.url,
              snippet,
              confidence: qsaConfirmsSocio === true ? 'strong' : 'medium',
              evidenceType: qsaConfirmsSocio === true ? 'qsa' : 'registry',
              relationshipScope: scopedRelationship.relationshipScope,
              rootContext: scopedRelationship.rootContext,
              rootCompanyName: params.rootCompanyName,
              rootCnpj: rootCnpjLocal || undefined,
              role: official.cnaeDescricao || official.cnae,
              sourceDepth: 'cnpj_lookup',
            });
            continue;
          } catch (error) {
            scoutDiag.warn('SocioSearch', 'falha ao enriquecer CNPJ encontrado', {
              cnpj,
              url: block.url,
              message: error instanceof Error ? error.message : String(error),
            });
          }

        enrichedAnyCnpj = true;
        addCompany({
          ...buildPendingCompanyForCnpj({
            cnpj,
            title: block.title,
            snippet,
            url: block.url,
            socioName: params.socioName,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: params.rootCnpj,
            sourceDepth,
          }),
          rootCompanyName: params.rootCompanyName,
          rootCnpj: rootCnpjLocal || undefined,
        });
      }

      if (enrichedAnyCnpj) continue;

      const name = inferCompanyName(block.title, snippet);
      addCompany({
        name,
        country: isInternational(block.title, block.snippet, block.url) ? 'CO' : undefined,
        partnerName: params.socioName,
        sourceTitle: block.title,
        sourceUrl: block.url,
        snippet,
        confidence: evidence.confidence,
        evidenceType: inferEvidenceType(block.title, block.snippet, block.url),
        relationshipScope: evidence.relationshipScope,
        rootContext: evidence.rootContext,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: normalizeCnpj(params.rootCnpj) || undefined,
        sourceDepth,
      });
    }
  };

  const processCnpjAbertoCompanies = async (candidates: CnpjAbertoCompanyResult[]) => {
    for (const candidate of candidates) {
      if (!hasSearchBudget() || companies.length >= MAX_COMPANIES) {
        if (companies.length >= MAX_COMPANIES) markTruncated('company_limit');
        else if (companies.length > 0) markTruncated('deadline');
        else degraded = true;
        break;
      }

      const cnpj = normalizeCnpj(candidate.cnpj || '');
      if (!isValidCnpj(cnpj)) {
        rejected.push({
          sourceTitle: candidate.sourceTitle,
          sourceUrl: candidate.sourceUrl,
          snippet: candidate.snippet,
          reason: 'CNPJ Aberto retornou empresa sem CNPJ valido.',
        });
        continue;
      }
      cnpjsFound.add(cnpj);

      if (isInactiveRegistrationStatus(candidate.registrationStatus)) {
        rejected.push({
          sourceTitle: candidate.sourceTitle,
          sourceUrl: candidate.sourceUrl,
          snippet: candidate.snippet,
          reason: `CNPJ baixado/inativo na Receita: ${candidate.registrationStatus}. Referenciado fora do inventario principal.`,
        });
        continue;
      }

      let official: Awaited<ReturnType<typeof lookupCnpj>> | null = null;
      let qsaConfirmsSocio: boolean | null = null;
      const remainingMs = remainingSearchBudget();
      const canTryOfficialLookup = cnpjLookupAttempts < MAX_CNPJ_LOOKUPS && remainingMs >= 1_000;

      if (canTryOfficialLookup) {
        try {
          cnpjLookupAttempts += 1;
          official = await lookupCnpj(cnpj, {
            timeoutMs: Math.min(CNPJ_LOOKUP_TIMEOUT_MS, Math.max(1_000, remainingMs - 500)),
            maxSources: 1,
          });
          cnpjsEnriched += 1;
          qsaConfirmsSocio = officialQsaIncludesSocio(official.qsa, params.socioName);
          if (qsaConfirmsSocio === false) {
            rejected.push({
              sourceTitle: candidate.sourceTitle,
              sourceUrl: candidate.sourceUrl,
              snippet: candidate.snippet,
              reason: `QSA oficial nao confirma o socio ${params.socioName} neste CNPJ.`,
            });
            continue;
          }
        } catch (error) {
          scoutDiag.warn('SocioSearch', 'falha ao enriquecer CNPJ do CNPJ Aberto', {
            cnpj,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      addCompany(
        buildCnpjAbertoCompany({
          candidate,
          official,
          qsaConfirmsSocio,
          socioName: params.socioName,
          rootCompanyName: params.rootCompanyName,
          rootCnpj: params.rootCnpj,
        }),
      );
    }
  };

  const socioIsPessoaFisica = !isPessoaJuridica(params.socioName);
  let cnpjAbertoStructuredReturned = false;

  if (socioIsPessoaFisica && hasSearchBudget()) {
    queriesRun.push('cnpjaberto.com/companies_by_owner');
    const before = snapshotCounts();
    const cnpjAbertoCompanies = await searchCnpjAbertoCompanies(params.socioName);
    if (cnpjAbertoCompanies?.length) {
      cnpjAbertoStructuredReturned = true;
      scoutDiag.info('SocioSearch', 'CNPJ Aberto retornou resultados estruturados, processando');
      await processCnpjAbertoCompanies(cnpjAbertoCompanies);
      traceProvider({
        provider: 'cnpj_aberto',
        attempted: true,
        returnedCount: cnpjAbertoCompanies.length,
        acceptedCount: companies.length - before.companies,
        rejectedCount: rejected.length - before.rejected,
      });
    } else {
      searchFailureCount += 1;
      degraded = true;
      scoutDiag.warn('SocioSearch', 'CNPJ Aberto indisponivel, fallback para consultasocio.com');
      traceProvider({
        provider: 'cnpj_aberto',
        attempted: true,
        returnedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'empty_or_unavailable',
      });
    }
  }

  if (!cnpjAbertoStructuredReturned && socioIsPessoaFisica && companies.length === 0 && hasSearchBudget()) {
    queriesRun.push('consultasocio.com/direct');
    const before = snapshotCounts();
    const consultasocioContent = await searchConsultasocioDirect(params.socioName);
    const consultasocioBlocks = consultasocioContent ? splitSearchBlocks(consultasocioContent) : [];
    const blockCount = consultasocioBlocks.length;
    if (consultasocioContent && !/Nenhum resultado encontrado/i.test(consultasocioContent)) {
      scoutDiag.info('SocioSearch', 'consultasocio.com retornou resultados, processando');
      await processContentBlocks(consultasocioBlocks);
      traceProvider({
        provider: 'consultasocio',
        attempted: true,
        returnedCount: blockCount,
        acceptedCount: companies.length - before.companies,
        rejectedCount: rejected.length - before.rejected,
      });
    } else if (!consultasocioContent) {
      searchFailureCount += 1;
      degraded = true;
      scoutDiag.warn('SocioSearch', 'consultasocio.com falhou, fallback para DDG');
      traceProvider({
        provider: 'consultasocio',
        attempted: true,
        returnedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'empty_or_unavailable',
      });
    } else {
      traceProvider({
        provider: 'consultasocio',
        attempted: true,
        returnedCount: blockCount,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'no_result',
      });
    }
  }

  if (!cnpjAbertoStructuredReturned)
    for (const query of queries) {
      if (!hasSearchBudget() || companies.length >= MAX_COMPANIES) {
        if (companies.length >= MAX_COMPANIES) markTruncated('company_limit');
        else if (companies.length > 0) markTruncated('deadline');
        else degraded = true;
        break;
      }
      queriesRun.push(query);
      const before = snapshotCounts();
      const content = await performWebSearch(query, { count: 10 });
      if (!content) {
        searchFailureCount += 1;
        degraded = true;
        traceProvider({
          provider: 'web_search',
          query,
          attempted: true,
          returnedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          reason: 'failure',
        });
        continue;
      }
      if (/Nenhum resultado encontrado/i.test(content)) {
        searchNoResultCount += 1;
        degraded = true;
        traceProvider({
          provider: 'web_search',
          query,
          attempted: true,
          returnedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          reason: 'no_result',
        });
        continue;
      }

      const blocks = splitSearchBlocks(content);
      const blockCount = blocks.length;
      await processContentBlocks(blocks);
      traceProvider({
        provider: 'web_search',
        query,
        attempted: true,
        returnedCount: blockCount,
        acceptedCount: companies.length - before.companies,
        rejectedCount: rejected.length - before.rejected,
      });
    }

  const payload: SocioSearchResponse = {
    companies,
    rejected,
    degraded: companies.length === 0 ? degraded : truncated,
    cached: false,
    diagnostics: {
      queriesRun,
      pagesFetched,
      cacheSource: 'none' as SocioSearchCacheSource,
      rejectedCount: rejected.length,
      cnpjsEnriched: cnpjsEnriched || undefined,
      totalCnpjsFound: cnpjsFound.size || undefined,
      searchNoResultCount: searchNoResultCount || undefined,
      searchFailureCount: searchFailureCount || undefined,
      truncated: truncated || undefined,
      truncatedReason,
    },
  };

  if (traceEnabled) {
    payload.trace = {
      enabled: true,
      providers: providersTrace,
      totals: {
        companiesCount: companies.length,
        rejectedCount: rejected.length,
        pagesFetched,
        cnpjsEnriched,
        cnpjsFound: Array.from(cnpjsFound).slice(0, 100),
        queriesRun,
        degraded: payload.degraded,
        truncated,
        truncatedReason,
        searchNoResultCount,
        searchFailureCount,
      },
      rejectedByReason: countRejectedByReason(rejected),
    };
  }

  return payload;
}
