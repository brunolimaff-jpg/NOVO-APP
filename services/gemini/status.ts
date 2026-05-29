export const DOSSIE_STATUS = {
  intent: 'Capturando intenção tática da consulta...',
  complexity: 'Avaliando profundidade da infraestrutura...',
  context: 'Consolidando perímetro da conta alvo...',
  history: 'Recuperando inteligência de conversas anteriores...',
  enrichment: 'Enriquecendo sinais e contexto comercial estratégico...',
  prompt: 'Orquestrando protocolo de investigação forense...',
  cadastral: 'Rastreando registros cadastrais e fiscais...',
  rag: 'Consultando base de inteligência Senior...',
  concorrentes: 'Mapeando ecossistema competitivo regional...',
  benchmark: 'Auditando referências e contrapartidas de mercado...',
  deepResearch: 'Infiltrando em fontes externas e sinais digitais...',
  corporate: 'Desconstruindo teia societária e holdings...',
  tech: 'Analisando stack tecnológico e legados digitais...',
  compliance: 'Escaneando riscos fiscais e compliance SEFAZ...',
  rh: 'Mapeando centro de gravidade: Decisores e RH...',
  logistica: 'Investigando malha logística e supply chain...',
  scoring: 'Calibrando Score PORTA contra o setor...',
  model: 'Processando em motores de inferência tática...',
  validation: 'Validando integridade e consistência dos achados...',
  synthesis: 'Sintetizando narrativa executiva de alto impacto...',
  finalReview: 'Auditando consistência final da entrega...',
  response: 'Materializando recomendações práticas...',
  hooks: 'Preparando ganchos para fechamento...',
  consolidando: 'Consolidando dossiê de inteligência final...',
} as const;

export type DossieStatusKey = keyof typeof DOSSIE_STATUS;

export function emitDossieStatus(onStatus: ((status: string) => void) | undefined, key: DossieStatusKey): void {
  onStatus?.(DOSSIE_STATUS[key]);
}
