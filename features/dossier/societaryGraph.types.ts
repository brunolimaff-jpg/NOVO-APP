export type SocietaryConfidence = 'official' | 'strong' | 'medium' | 'weak';
export type SocietaryEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
export type SocietaryRelationshipScope = 'group_link' | 'partner_other_cnpj' | 'unconfirmed';
export type SocietaryBadge = 'holding' | 'oficial' | 'internacional' | 'validar';

export interface SocietaryRootInput {
  cnpj?: string | null;
  name: string;
}

export interface SocietaryPartnerInput {
  id?: string;
  name: string;
  role?: string;
  document?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence?: SocietaryConfidence;
}

export interface SocietaryCompanyInput {
  name: string;
  cnpj?: string | null;
  rawCnpjLabel?: string;
  country?: string | null;
  partnerName: string;
  role?: string;
  branchCount?: number;
  branchCnpjs?: string[];
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence?: SocietaryConfidence;
  evidenceType?: SocietaryEvidenceType;
  relationshipScope?: SocietaryRelationshipScope;
  validationStatus?: 'official' | 'pending' | 'rejected';
  rootContext?: boolean;
  rootCompanyName?: string;
  rootCnpj?: string | null;
}

export interface SocietaryPartner {
  id: string;
  name: string;
  role?: string;
  document?: string;
  sourceTitle?: string;
  confidence: SocietaryConfidence;
}

export interface SocietaryCompany {
  id: string;
  name: string;
  cnpj?: string;
  rawCnpjLabel?: string;
  branchCount?: number;
  branchCnpjs?: string[];
  country?: string;
  role?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence: SocietaryConfidence;
  evidenceType: SocietaryEvidenceType;
  relationshipScope: SocietaryRelationshipScope;
  validationStatus?: 'official' | 'pending' | 'rejected';
  rootContext: boolean;
  rootCompanyName?: string;
  rootCnpj?: string;
  partnerIds: string[];
  rootLinked?: boolean;
  badges: SocietaryBadge[];
}

export interface RejectedSocietaryCompany {
  input: SocietaryCompanyInput;
  reason: string;
}

export interface SocietaryGraph {
  root: {
    id: 'root';
    name: string;
    cnpj?: string;
  };
  partners: SocietaryPartner[];
  companies: SocietaryCompany[];
  rejectedCompanies: RejectedSocietaryCompany[];
  rootBranchCount: number;
}

export interface BuildSocietaryGraphInput {
  root: SocietaryRootInput;
  partners: SocietaryPartnerInput[];
  companies?: SocietaryCompanyInput[];
}

export interface BuildSocietaryMermaidOptions {
  selectedPartnerId?: string | null;
  /** When true, render only Root → Partner hub (no companies). Auto-true when no selectedPartnerId and multiple partners exist. See buildSocietaryMermaid. */
  overviewOnly?: boolean;
}
