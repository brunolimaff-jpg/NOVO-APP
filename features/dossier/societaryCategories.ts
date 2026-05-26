import type { SocietaryCompany, SocietaryPartner } from './societaryGraph';

export type CompanyCategory = 'em_comum' | 'proprias';

const PJ_SUFFIXES = [
  'LTDA', 'S/A', 'S.A.', 'S.A', 'CIA', 'ME', 'EPP',
  'EIRELI', 'SLU', 'LLC', 'INC', 'CORP', 'SAS', 'SA',
];

export function isPartnerPJ(partner: SocietaryPartner): boolean {
  if (partner.document) {
    const digits = partner.document.replace(/\D/g, '');
    if (digits.length >= 14) return true;
  }
  const upper = partner.name.toUpperCase().trim();
  return PJ_SUFFIXES.some(s =>
    upper.endsWith(` ${s}`) || upper.endsWith(`.${s}`) || upper === s,
  );
}

export function getPFPartnerIds(partners: SocietaryPartner[]): Set<string> {
  return new Set(partners.filter(p => !isPartnerPJ(p)).map(p => p.id));
}

export function classifyCompany(
  company: SocietaryCompany,
  pfPartnerIds?: Set<string>,
): CompanyCategory {
  if (!pfPartnerIds) {
    return company.partnerIds.length >= 2 ? 'em_comum' : 'proprias';
  }
  const pfCount = company.partnerIds.filter(id => pfPartnerIds.has(id)).length;
  return pfCount >= 2 ? 'em_comum' : 'proprias';
}

export function isSideBusiness(company: SocietaryCompany): boolean {
  return company.relationshipScope === 'partner_other_cnpj';
}

export function countByCategory(
  companies: SocietaryCompany[],
  pfPartnerIds?: Set<string>,
): { found: number; total: number; em_comum: number; proprias: number } {
  const result = { found: companies.length, total: 0, em_comum: 0, proprias: 0 };
  for (const company of companies) {
    if (!isSideBusiness(company)) result.total += 1;
    const category = classifyCompany(company, pfPartnerIds);
    result[category] += 1;
  }
  return result;
}
