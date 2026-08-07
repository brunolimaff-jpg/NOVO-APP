/**
 * T2 — CanonicalRelationResolver (V4 Pipeline Guarded).
 *
 * Função pura que materializa relações canônicas com precedência
 * `same_root > direct_pj_relation > partner_other_cnpj`, deduplica a PJ
 * direta que reaparece via socio-search e nunca emite CPF.
 *
 * Regras de domínio (PACOTE_CANONICO_SCOUT_V4.md §5 e definição final):
 * - mesma raiz CNPJ = mesma pessoa jurídica (matriz/filial);
 * - PJ diretamente no QSA = participação societária confirmada;
 * - empresa encontrada via sócio = lateral por padrão;
 * - compartilhar sócio NÃO prova grupo econômico;
 * - CNPJ já direto não reaparece como lateral.
 */
import type { CanonicalAccount, RelationType } from './gold-contracts';

export interface RelatedCompany {
  cnpj: string;
  legalName?: string | null;
  source: string;
}

export interface ResolvedRelation {
  /** CNPJ normalizado (14 dígitos). */
  relatedCnpj: string;
  relatedLegalName?: string | null;
  relationType: RelationType;
  /** Origem da relação (raiz | qsa | socio-search). */
  source: string;
  /** Motivo legível da classificação. */
  reason: string;
}

export function normalizeCnpj(value: string): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

function rootOf(cnpjDigits: string): string {
  return cnpjDigits.slice(0, 8);
}

export function resolveCanonicalRelations(
  canonical: CanonicalAccount,
  related: RelatedCompany[],
): ResolvedRelation[] {
  const root = rootOf(canonical.rootCnpj.replace(/\D/g, ''));
  const directPjCnpjs = new Set(
    canonical.directPjPartners
      .map((p) => normalizeCnpj(p.cnpj))
      .filter((c): c is string => c.length === 14),
  );

  const seen = new Map<string, ResolvedRelation>();

  for (const company of related) {
    const cnpj = normalizeCnpj(company.cnpj);
    // Zero CPF: entrada com CPF (11 dígitos) ou formato inválido é ignorada.
    if (cnpj.length !== 14) continue;

    let relationType: RelationType;
    let source: string;
    let reason: string;

    if (cnpj.slice(0, 8) === root) {
      relationType = 'same_root';
      source = 'raiz';
      reason = 'Mesma raiz CNPJ — matriz/filial da mesma pessoa jurídica';
    } else if (directPjCnpjs.has(cnpj)) {
      relationType = 'direct_pj_relation';
      source = 'qsa';
      reason = 'PJ diretamente presente no QSA — relação societária confirmada';
    } else {
      relationType = 'partner_other_cnpj';
      source = 'socio-search';
      reason = 'Encontrada via sócio — relação lateral por padrão (compartilhar sócio não prova grupo)';
    }

    const existing = seen.get(cnpj);
    if (!existing) {
      seen.set(cnpj, {
        relatedCnpj: cnpj,
        relatedLegalName: company.legalName ?? null,
        relationType,
        source,
        reason,
      });
      continue;
    }

    // Deduplicação: preservar a evidência mais forte (direta > lateral).
    const precedence: Record<RelationType, number> = {
      same_root: 0,
      direct_pj_relation: 1,
      partner_other_cnpj: 2,
    };
    if (precedence[relationType] < precedence[existing.relationType]) {
      seen.set(cnpj, {
        ...existing,
        relationType,
        source,
        reason,
        relatedLegalName: existing.relatedLegalName ?? company.legalName ?? null,
      });
    }
  }

  return [...seen.values()];
}
