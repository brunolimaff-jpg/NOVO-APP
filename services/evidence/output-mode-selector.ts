export type OutputMode = 'FULL_DOSSIER' | 'DISCOVERY_BRIEF' | 'ENRICHMENT_REQUIRED';

export interface OutputModeDecision {
  mode: OutputMode;
  rationale: string;
  warnings: string[];
}

interface ConfidenceProfileInput {
  tierACount: number;
  tierBCount: number;
  modulesCovered: string[];
}

export function selectOutputMode(profile: ConfidenceProfileInput): OutputModeDecision {
  const { tierACount, tierBCount, modulesCovered } = profile;

  // ENRICHMENT_REQUIRED: sem fontes oficiais
  if (tierACount === 0 && tierBCount < 3) {
    return {
      mode: 'ENRICHMENT_REQUIRED',
      rationale: '0 fontes Tier A e ' + tierBCount + ' Tier B (<3) — faltam fontes mínimas',
      warnings: ['Dossiê não deve gerar tese forte — enriquecer fontes antes'],
    };
  }

  // DISCOVERY_BRIEF: evidência insuficiente
  if (tierACount + tierBCount < 5 || modulesCovered.length < 4) {
    return {
      mode: 'DISCOVERY_BRIEF',
      rationale:
        tierACount +
        ' Tier A + ' +
        tierBCount +
        ' Tier B em ' +
        modulesCovered.length +
        ' módulos — evidência insuficiente para tese forte',
      warnings: ['Hipótese comercial a validar, não tese confirmada'],
    };
  }

  // FULL_DOSSIER: evidência suficiente
  return {
    mode: 'FULL_DOSSIER',
    rationale:
      tierACount +
      ' Tier A + ' +
      tierBCount +
      ' Tier B em ' +
      modulesCovered.length +
      ' módulos — evidência suficiente',
    warnings: [],
  };
}
