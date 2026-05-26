import type { SocietaryCompany } from './societaryGraph';

export type CompanyCategory = 'strategic' | 'operation' | 'own';

export function classifyCompany(company: SocietaryCompany): CompanyCategory {
  if (company.partnerIds.length >= 3) return 'strategic';
  if (company.partnerIds.length >= 2) return 'operation';
  return 'own';
}

export function isSideBusiness(company: SocietaryCompany): boolean {
  return company.relationshipScope === 'partner_other_cnpj';
}

export function countByCategory(
  companies: SocietaryCompany[],
): { total: number; strategic: number; operation: number; own: number } {
  const result = { total: companies.length, strategic: 0, operation: 0, own: 0 };
  for (const company of companies) {
    const category = classifyCompany(company);
    result[category] += 1;
  }
  return result;
}
