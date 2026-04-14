/**
 * Centralização dos marcos (milestones) e etapas de carregamento
 * para garantir sincronia entre o orquestrador (App.tsx),
 * o motor de status (loadingStatus.ts) e a UI (LoadingSmart.tsx).
 */

export const MODULAR_DOSSIER_STAGES = [
  'Mapeando inteligência operacional...',
  'Investigando tech stack...',
  'Investigando riscos & compliance...',
  'Investigando estratégia & expansão...',
  'Investigando RH & decisores...',
  'Cruzando referências de mercado...',
  'Finalizando dossiê modular...',
] as const;

export type ModularDossierStage = typeof MODULAR_DOSSIER_STAGES[number];

/**
 * Mapeamento opcional para labels de UX caso os nomes técnicos das etapas
 * precisem de tradução ou polimento adicional na tela.
 */
export const STAGE_DISPLAY_LABELS: Record<string, string> = {
  'Mapeando inteligência operacional...': 'Mapeando inteligência operacional...',
  'Investigando tech stack...':           'Entendendo a operação e tecnologia...',
  'Investigando riscos & compliance...':  'Verificando riscos e conformidade...',
  'Investigando estratégia & expansão...': 'Analisando movimentos de mercado...',
  'Investigando RH & decisores...':       'Mapeando estrutura e liderança...',
  'Cruzando referências de mercado...':   'Reunindo referências de setor...',
  'Finalizando dossiê modular...':        'Consolidando inteligência final...',
};
