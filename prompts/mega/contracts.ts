export interface InvestigationPayload {
  companyName: string;
  cnpj?: string;
  city?: string;
  state?: string;
  aliases?: string[];
  segmentHint?: string;
}

export interface InvestigationBuildOptions {
  includeBudget?: boolean;
  mode?: 'standard' | 'executive' | 'ultraDepth' | 'warMode';
  strictAudit?: boolean;
  enableDiscrepancyHunter?: boolean;
  enableCostOfDelay?: boolean;
  promptVersion?: string;
}
