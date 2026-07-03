export type OutputMode = 'FULL_DOSSIER' | 'DISCOVERY_BRIEF' | 'ENRICHMENT_REQUIRED';

export interface OutputModeMeta {
  label: string;
  badgeClass: string;
  icon: string;
  description: string;
}

export const OUTPUT_MODE_META: Record<OutputMode, OutputModeMeta> = {
  FULL_DOSSIER: {
    label: 'Dossie Completo',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: '✅',
    description: 'Analise completa com tese comercial e modulos detalhados.',
  },
  DISCOVERY_BRIEF: {
    label: 'Brief de Descoberta',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: '🔍',
    description: 'Hipoteses iniciais a validar antes da tese comercial.',
  },
  ENRICHMENT_REQUIRED: {
    label: 'Enriquecimento Necessario',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: '⚠️',
    description: 'Fontes insuficientes. Requer dados adicionais antes da analise.',
  },
};
