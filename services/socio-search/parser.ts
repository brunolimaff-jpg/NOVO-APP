import { extractHtml, isValidPublicUrl, type CnpjAbertoCompanyResult } from '../../utils/documentExtractor.js';
import { sanitizeSensitivePersonalData } from '../../utils/privacy.js';
import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj.js';
import { scoutDiag } from '../../utils/diagnosticLog.js';
import {
  type SocioSearchCompany,
  type SocioSearchRelationshipScope,
  type SocioSearchClaimType,
  type SocioSearchRootRelationStatus,
  type SocioSearchSourceDepth,
  type SocioSearchSourceProvider,
  PAGE_EXTRACT_LIMIT,
  normalizeText,
} from './types.js';

// ============================================================
// SearchBlock
// ============================================================

export interface SearchBlock {
  title: string;
  url: string;
  snippet: string;
}

export function splitSearchBlocks(content: string): SearchBlock[] {
  return (content || '')
    .split(/\n---\n?/)
    .map(block => {
      const title = block.match(/Título:\s*([^\n]+)/i)?.[1]?.trim() || '';
      const url =
        block
          .match(/URL:\s*(https?:\/\/[^\s\n]+)/i)?.[1]
          ?.trim()
          .replace(/[),.;]+$/g, '') || '';
      const snippet = block.match(/Resumo:\s*([\s\S]+)/i)?.[1]?.trim() || '';
      return { title, url, snippet: sanitizeSensitivePersonalData(snippet) };
    })
    .filter(block => block.title && /^https?:\/\//i.test(block.url));
}

// ============================================================
// CNPJ
// ============================================================

export function extractCnpjMatches(text: string): Array<{ raw: string; cnpj: string; index: number }> {
  const matches: Array<{ raw: string; cnpj: string; index: number }> = [];
  const cnpjPattern = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  for (const match of text.matchAll(cnpjPattern)) {
    const raw = match[0];
    const cnpj = normalizeCnpj(raw);
    if (!isValidCnpj(cnpj)) continue;
    matches.push({ raw, cnpj, index: match.index || 0 });
  }
  return matches;
}

export function extractCnpjs(text: string): string[] {
  return [...new Set(extractCnpjMatches(text).map(match => match.cnpj))];
}

export function formatCnpjLabel(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

// ============================================================
// Construcao de empresas
// ============================================================

export function buildPendingCompanyForCnpj(params: {
  cnpj: string;
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCompanyName: string;
  rootCnpj: string;
  sourceDepth: SocioSearchSourceDepth;
}): SocioSearchCompany {
  const cnpj = normalizeCnpj(params.cnpj);
  return {
    name: inferCompanyNameForCnpj(cnpj, params.title, params.snippet),
    cnpj,
    rawCnpjLabel: `${formatCnpjLabel(cnpj)}*`,
    partnerName: params.socioName,
    sourceTitle: params.title,
    sourceUrl: params.url,
    snippet: params.snippet,
    confidence: 'weak',
    evidenceType: 'web',
    relationshipScope: 'unconfirmed',
    validationStatus: 'pending',
    rootContext: false,
    rootCompanyName: params.rootCompanyName,
    rootCnpj: normalizeCnpj(params.rootCnpj) || undefined,
    sourceDepth: params.sourceDepth,
  };
}

export function buildCnpjAbertoCompany(params: {
  candidate: CnpjAbertoCompanyResult;
  official?: Awaited<ReturnType<typeof import('../../lib/cnpjLookup.js').lookupCnpj>> | null;
  qsaConfirmsSocio: boolean | null;
  socioName: string;
  rootCompanyName: string;
  rootCnpj: string;
}): SocioSearchCompany {
  const cnpj = normalizeCnpj(params.official?.cnpj || params.candidate.cnpj || '');
  const rootCnpj = normalizeCnpj(params.rootCnpj);
  const sameRoot = isValidCnpj(cnpj) && isValidCnpj(rootCnpj) && cnpj.slice(0, 8) === rootCnpj.slice(0, 8);
  const relationshipScope: SocioSearchRelationshipScope = sameRoot ? 'group_link' : 'partner_other_cnpj';
  const officialName = params.official?.companyName?.trim() || '';
  const candidateName = params.candidate.name.trim();

  return {
    name: hasMeaningfulInferredCompanyName(officialName) ? officialName : candidateName,
    cnpj,
    partnerName: params.socioName,
    sourceTitle: params.candidate.sourceTitle,
    sourceUrl: params.candidate.sourceUrl,
    snippet: params.candidate.snippet,
    confidence: params.qsaConfirmsSocio === true ? 'strong' : 'medium',
    evidenceType: 'qsa',
    relationshipScope,
    validationStatus: 'official',
    rootContext: sameRoot,
    rootCompanyName: params.rootCompanyName,
    rootCnpj: rootCnpj || undefined,
    role: params.official?.cnaeDescricao || params.official?.cnae || params.candidate.role,
    sourceDepth: params.official ? 'cnpj_lookup' : 'search_result',
    sourceProvider: 'cnpj_aberto' as SocioSearchSourceProvider,
    evidenceBasis: 'official_qsa_owner_search',
    claimType: sameRoot
      ? ('group_relationship' as SocioSearchClaimType)
      : ('socio_participation' as SocioSearchClaimType),
    rootRelationStatus: sameRoot
      ? ('supported' as SocioSearchRootRelationStatus)
      : ('not_supported' as SocioSearchRootRelationStatus),
    operationalThesisAllowed: sameRoot,
  };
}

// ============================================================
// Status de registro
// ============================================================

export function isInactiveRegistrationStatus(value?: string): boolean {
  const status = normalizeText(value || '');
  return /\b(baixad|inativ|inapt|suspens|nul)\w*\b/.test(status);
}

// ============================================================
// Inferencia de nome de empresa
// ============================================================

export function cleanInferredCompanyName(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  const tokens = compact.split(/\s+/).filter(Boolean);
  const legalSuffixIndex = tokens.findIndex(token => /^(LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME)$/i.test(token));
  if (legalSuffixIndex > 1) {
    for (let index = legalSuffixIndex - 1; index >= 1; index--) {
      const token = tokens[index];
      const previous = tokens[index - 1];
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]/.test(token) && /^[a-zà-ÿ]/.test(previous)) {
        return tokens.slice(index).join(' ');
      }
    }
  }
  return compact;
}

export function hasMeaningfulInferredCompanyName(value: string): boolean {
  const legalOnly = new Set(['cia', 'companhia', 'ltda', 'sa', 's', 'a', 'sas', 'me', 'eireli']);
  return normalizeText(value)
    .split(/\s+/)
    .some(token => token.length >= 3 && !legalOnly.has(token));
}

function inferredNameOrCnpjFallback(value: string, cnpj: string): string {
  const cleaned = cleanInferredCompanyName(value);
  return hasMeaningfulInferredCompanyName(cleaned) ? cleaned : `Empresa CNPJ ${formatCnpjLabel(cnpj)}`;
}

export function inferCompanyNameForCnpj(cnpj: string, title: string, snippet: string): string {
  const text = `${title} ${snippet}`.replace(/\s+/g, ' ');
  const matches = extractCnpjMatches(text);
  const matchIndex = matches.findIndex(item => item.cnpj === cnpj);
  const match = matches[matchIndex];
  if (!match) return inferredNameOrCnpjFallback(inferCompanyName(title, snippet), cnpj);

  const before = text.slice(Math.max(0, match.index - 260), match.index).trim();
  const previousMatch = matchIndex > 0 ? matches[matchIndex - 1] : null;
  const localBefore = text
    .slice(previousMatch ? previousMatch.index + previousMatch.raw.length : 0, match.index)
    .trim();
  const localNameMatches = [
    ...localBefore.matchAll(
      /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100}?(?:LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))/gi,
    ),
  ];
  const localName = localNameMatches.at(-1)?.[1];
  if (localName) return inferredNameOrCnpjFallback(localName, cnpj);

  const reasonName = before.match(
    /raz[aã]o social\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9&.\s-]{2,100}?(?:LTDA|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))/i,
  )?.[1];
  if (reasonName) return inferredNameOrCnpjFallback(reasonName, cnpj);

  const companyBeforeCnpj = before.match(
    /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100}?(?:LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))\s*(?:ativa|inativa|opera|com|,|;|-)?$/i,
  )?.[1];
  if (companyBeforeCnpj) return inferredNameOrCnpjFallback(companyBeforeCnpj, cnpj);

  const listedName = before.match(
    /empresas? em que [^:]{0,80}:\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100})$/i,
  )?.[1];
  if (listedName) return inferredNameOrCnpjFallback(listedName, cnpj);

  return inferredNameOrCnpjFallback(inferCompanyName(title, snippet), cnpj);
}

export async function fetchCandidatePage(url: string): Promise<string> {
  if (!isValidPublicUrl(url)) return '';

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return '';

    const contentType = response.headers?.get?.('content-type')?.toLowerCase() || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) return '';

    const body = await response.text();
    const extracted = contentType.includes('text/plain') ? body : await extractHtml(body, PAGE_EXTRACT_LIMIT);
    return sanitizeSensitivePersonalData(extracted).slice(0, PAGE_EXTRACT_LIMIT);
  } catch (error) {
    scoutDiag.warn('SocioSearch', 'falha ao abrir pagina candidata', {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

export function inferCompanyName(title: string, snippet: string): string {
  const text = `${title} ${snippet}`;
  if (/scheffer\s+colombia\s+s\.?a\.?s\.?/i.test(text)) return 'Scheffer Colombia S.A.S.';

  const sas = text.match(
    /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç&.\s-]{2,80}\b(?:S\.?A\.?S\.?|S\/A|LTDA|Ltda|S\.A\.))\b/,
  );
  if (sas?.[1]) return sas[1].replace(/\s+/g, ' ').trim();

  return title
    .replace(/\s*[-|].*$/g, '')
    .replace(/\b(importa[cç][oõ]es|exporta[cç][oõ]es|participa[cç][oõ]es|dados|empresa)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Re-export for convenience
export { isValidPublicUrl } from '../../utils/documentExtractor.js';
