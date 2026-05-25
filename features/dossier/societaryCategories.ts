import type { SocietaryCompany } from './societaryGraph';

export type CompanyCategory = 'strategic' | 'operation' | 'own';

export function classifyCompany(company: SocietaryCompany): CompanyCategory {
  // Unconfirmed/pending → own
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') {
    return 'own';
  }
  // Partner other CNPJ → own (exclusive to one partner)
  if (company.relationshipScope === 'partner_other_cnpj') {
    return 'own';
  }
  // 3+ partners sharing → strategic (holding/group-level)
  if (company.partnerIds.length >= 3) {
    return 'strategic';
  }
  // 2 partners sharing → operation (shared operational)
  if (company.partnerIds.length >= 2) {
    return 'operation';
  }
  // Single partner → own
  return 'own';
}

export function isSideBusiness(company: SocietaryCompany): boolean {
  return company.relationshipScope === 'partner_other_cnpj';
}

export function countByCategory(
  companies: SocietaryCompany[],
): { total: number; strategic: number; operation: number; own: number } {
  const result = { total: companies.length, strategic: 0, operation: 0, own: 0 };
  for (const c of companies) {
    const cat = classifyCompany(c);
    result[cat]++;
  }
  return result;
}
