import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj.js';
import {
  type SocioSearchCompany,
  type SocioSearchConfidence,
  type SocioSearchEvidenceType,
  type SocioSearchRelationshipScope,
  normalizeText,
} from './types.js';

// ============================================================
// Evidence type
// ============================================================

export function inferEvidenceType(title: string, snippet: string, url: string): SocioSearchEvidenceType {
  const haystack = normalizeText(`${title} ${snippet} ${url}`);
  if (/cnpj|qsa|societ|socio|receita|empresa/.test(haystack)) return 'registry';
  if (/site oficial|institucional|forbes|emis|portafolio/.test(haystack)) return 'institutional';
  return 'web';
}

// ============================================================
// International detection
// ============================================================

export function isInternational(title: string, snippet: string, url: string): boolean {
  return /colombia|colômbia|sas|nit|\/COLOMBIA\//i.test(`${title} ${snippet} ${url}`);
}

// ============================================================
// Score evidence
// ============================================================

export function scoreEvidence(params: {
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCompanyName: string;
  rootCnpj: string;
  cnpjs?: string[];
}): {
  confidence: SocioSearchConfidence;
  relationshipScope: SocioSearchRelationshipScope;
  rootContext: boolean;
  socioContext: boolean;
  rejectReason?: string;
} {
  const haystack = normalizeText(`${params.title} ${params.snippet} ${params.url}`);
  const digitHaystack = `${params.title} ${params.snippet} ${params.url}`.replace(/\D/g, '');
  const socioParts = normalizeText(params.socioName)
    .split(/\s+/)
    .filter(part => part.length > 2);
  const socioPartSet = new Set(socioParts);
  const normalizedRootName = normalizeText(params.rootCompanyName);
  const rootParts = normalizedRootName
    .split(/\s+/)
    .filter(
      part =>
        part.length > 2 &&
        !socioPartSet.has(part) &&
        !['ltda', 'cia', 'sa', 's/a', 'saa', 'agro', 'agricola'].includes(part),
    );
  const rootCnpj = normalizeCnpj(params.rootCnpj);

  const socioHitCount = socioParts.filter(part => haystack.includes(part)).length;
  const socioHit = socioHitCount >= Math.min(2, socioParts.length);
  const rootPhraseHit = normalizedRootName.length > 0 && haystack.includes(normalizedRootName);
  const rootHit = rootPhraseHit || (rootParts.length > 0 && rootParts.some(part => haystack.includes(part)));
  const cnpjHit = isValidCnpj(rootCnpj) && digitHaystack.includes(rootCnpj);
  const internationalHit = isInternational(params.title, params.snippet, params.url);
  const strongDomain = /consultasocio|cnpj|veritrade|emis|portafolio|scheffer\.agr/i.test(params.url);
  const negativeConnection = /sem conexao|nao conectado|homonimo/.test(haystack);
  const groupContextHit = rootHit || cnpjHit;
  const hasValidCnpj = (params.cnpjs || []).some(cnpj => isValidCnpj(cnpj));
  const registryContext =
    /consultasocio|cnpj|qsa|societ|socio|sócio|administrador|quadro/.test(haystack) ||
    /consultasocio|cnpj|receita/i.test(params.url);

  if (negativeConnection) {
    return {
      confidence: 'weak',
      relationshipScope: 'unconfirmed',
      rootContext: false,
      socioContext: false,
      rejectReason: 'Possivel homonimo sem contexto suficiente do socio.',
    };
  }
  if (socioHit && groupContextHit && (cnpjHit || internationalHit || strongDomain)) {
    return { confidence: 'strong', relationshipScope: 'group_link', rootContext: true, socioContext: true };
  }
  if (socioHit && groupContextHit) {
    return { confidence: 'medium', relationshipScope: 'group_link', rootContext: true, socioContext: true };
  }
  if (socioHit && hasValidCnpj && (strongDomain || registryContext)) {
    return {
      confidence: 'strong',
      relationshipScope: 'partner_other_cnpj',
      rootContext: false,
      socioContext: true,
    };
  }

  return {
    confidence: 'weak',
    relationshipScope: 'unconfirmed',
    rootContext: false,
    socioContext: socioHit,
    rejectReason: 'Possivel homonimo sem CNPJ valido ou fonte societaria suficiente.',
  };
}

// ============================================================
// Source socio-centric check
// ============================================================

export function sourceLooksSocioCentric(title: string, snippet: string, url: string, socioName: string): boolean {
  const haystack = normalizeText(`${title} ${snippet} ${url}`);
  const socioParts = normalizeText(socioName)
    .split(/\s+/)
    .filter(part => part.length > 2);
  const socioHitCount = socioParts.filter(part => haystack.includes(part)).length;
  const socioHit = socioHitCount >= Math.min(2, socioParts.length);
  return (
    /consultasocio\.com\/q\/sa/i.test(url) ||
    /econodata\.com\.br\/consulta-empresa|econodata\.com\.br\/consulta-socio/i.test(url) ||
    (socioHit &&
      /empresas em que|socio administrador|sócio administrador|quadro societario|quadro societário|consta como socio|consta como sócio/.test(
        haystack,
      ))
  );
}

// ============================================================
// Scope for enriched CNPJ
// ============================================================

export function scopeForEnrichedCnpj(params: {
  cnpj: string;
  evidence: ReturnType<typeof scoreEvidence>;
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCnpj: string;
}): Pick<SocioSearchCompany, 'relationshipScope' | 'rootContext'> {
  const cnpj = normalizeCnpj(params.cnpj);
  const rootCnpj = normalizeCnpj(params.rootCnpj);
  if (isValidCnpj(cnpj) && isValidCnpj(rootCnpj) && cnpj.slice(0, 8) === rootCnpj.slice(0, 8)) {
    return { relationshipScope: 'group_link', rootContext: true };
  }

  if (
    params.evidence.relationshipScope === 'group_link' &&
    sourceLooksSocioCentric(params.title, params.snippet, params.url, params.socioName)
  ) {
    return { relationshipScope: 'partner_other_cnpj', rootContext: false };
  }

  return {
    relationshipScope: params.evidence.relationshipScope,
    rootContext: params.evidence.rootContext,
  };
}

// ============================================================
// Query builder
// ============================================================

export function buildQueries(socioName: string, rootCompanyName: string): string[] {
  return [
    `"${socioName}" "${rootCompanyName}" socio`,
    `"${socioName}" "${rootCompanyName}" empresa`,
    `"${socioName}" cnpj`,
    `"${socioName}" socio administrador`,
    `"${socioName}" quadro societario`,
    `"${socioName}" ${rootCompanyName}`,
  ];
}

// ============================================================
// Token matching
// ============================================================

export function tokenizeName(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

export function nameTokensMatchStrictly(candidateName: string, socioName: string): boolean {
  const socioTokens = tokenizeName(socioName);
  const candidateTokens = tokenizeName(candidateName);
  if (socioTokens.length === 0 || candidateTokens.length === 0) return false;
  if (candidateTokens.join(' ') === socioTokens.join(' ')) return true;

  const socioSignificantTokens = socioTokens.filter(part => part.length > 2);
  const socioInitials = new Set(socioTokens.filter(part => part.length === 1));
  if (socioSignificantTokens.length === 0) return false;

  let cursor = -1;
  const matchedIndexes: number[] = [];
  for (const token of socioSignificantTokens) {
    const nextIndex = candidateTokens.findIndex((candidateToken, index) => index > cursor && candidateToken === token);
    if (nextIndex === -1) return false;
    matchedIndexes.push(nextIndex);
    cursor = nextIndex;
  }

  if (socioSignificantTokens.length <= 2) {
    const firstIndex = matchedIndexes[0];
    const lastIndex = matchedIndexes[matchedIndexes.length - 1];
    const middleTokens = candidateTokens
      .slice(firstIndex + 1, lastIndex)
      .filter(token => !socioSignificantTokens.includes(token));
    return middleTokens.every(token => socioInitials.has(token.charAt(0)));
  }

  return true;
}

// ============================================================
// QSA includes socio check
// ============================================================

export function officialQsaIncludesSocio(qsa: Array<{ name?: string }> | undefined, socioName: string): boolean | null {
  if (!qsa || qsa.length === 0) return null;
  return qsa.some(partner => nameTokensMatchStrictly(partner.name || '', socioName));
}
