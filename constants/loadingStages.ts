/**
 * Centralização dos marcos (milestones) e etapas de carregamento
 * para garantir sincronia entre o orquestrador (App.tsx),
 * o motor de status (loadingStatus.ts) e a UI (LoadingSmart.tsx).
 */

export const MODULAR_DOSSIER_STAGES = [
  'Mapeando conta real e teia societária...',
  'Mapeando operação e cadeia de valor...',
  'Identificando bordas de controle...',
  'Verificando pressões e compliance...',
  'Mapeando caminho de venda...',
  'Cruzando referências de mercado...',
  'Finalizando cards de auditoria...',
] as const;

export type ModularDossierStage = (typeof MODULAR_DOSSIER_STAGES)[number];

export const MODULAR_DOSSIER_CONSOLIDATION_STAGE = 'Consolidando informações...';

/**
 * Mapeamento opcional para labels de UX caso os nomes técnicos das etapas
 * precisem de tradução ou polimento adicional na tela.
 */
export const STAGE_DISPLAY_LABELS: Record<string, string> = {
  'Mapeando conta real e teia societária...': 'Mapeando conta real e teia societária...',
  'Mapeando operação e cadeia de valor...': 'Entendendo operação e cadeia de valor...',
  'Identificando bordas de controle...': 'Identificando bordas de controle...',
  'Verificando pressões e compliance...': 'Verificando pressões e compliance...',
  'Mapeando caminho de venda...': 'Mapeando caminho de venda...',
  'Cruzando referências de mercado...': 'Reunindo referências de setor...',
  'Finalizando cards de auditoria...': 'Consolidando cards de auditoria...',
  [MODULAR_DOSSIER_CONSOLIDATION_STAGE]: MODULAR_DOSSIER_CONSOLIDATION_STAGE,
};
