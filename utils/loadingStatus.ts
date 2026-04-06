import { sanitizeLoadingContextText } from './textCleaners';

const STATUS_PHASES = {
  intent:        'Capturando intenção tática da consulta...',
  complexity:    'Avaliando profundidade da infraestrutura...',
  context:       'Consolidando perímetro da conta alvo...',
  history:       'Recuperando inteligência de conversas anteriores...',
  enrichment:    'Enriquecendo sinais e contexto comercial estratégico...',
  prompt:        'Orquestrando protocolo de investigação forense...',
  deepResearch:  'Infiltrando em fontes externas e sinais digitais...',
  benchmark:     'Auditando referências e contrapartidas de mercado...',
  knowledgeBase: 'Consultando inteligência Senior...',
  model:         'Processando em motores de inferência tática...',
  validation:    'Validando integridade e consistência dos achados...',
  synthesis:     'Sintetizando narrativa executiva de alto impacto...',
  finalReview:   'Auditando consistência final da entrega...',
  response:      'Materializando recomendações práticas...',
  hooks:         'Preparando ganchos para fechamento...',
  cadastral:     'Rastreando registros cadastrais e fiscais...',
  corporate:     'Desconstruindo teia societária e holdings...',
  tech:          'Analisando stack tecnológico e legados digitais...',
  compliance:    'Escaneando riscos fiscais e compliance SEFAZ...',
  rh:            'Mapeando centro de gravidade: Decisores e RH...',
  logistica:     'Investigando malha logística e supply chain...',
  fiscal:        'Auditando incentivos e benefícios fiscais...',
  territorio:    'Mapeando inteligência territorial estratégica...',
  scoring:       'Calibrando Score PORTA contra o setor...',
  consolidando:  'Consolidando dossiê de inteligência final...',
  rag:           'Consultando base de inteligência Senior...',
  concorrentes:  'Mapeando ecossistema competitivo regional...',
} as const;

export type StatusPhaseKey = keyof typeof STATUS_PHASES;

export interface RichLoadingStatus {
  label: string;
  icon: string;
  category: StatusPhaseKey | 'fase' | 'unknown';
  phaseNumber?: number;
}

const LIVE_PHASE_LABELS: Record<number, { label: string; icon: string }> = {
  [-1]: { label: 'Riscos Ocultos',                    icon: '⚠️'  },
  1:    { label: 'Incentivos Fiscais',                icon: '💰'  },
  2:    { label: 'Intel Territorial',                 icon: '🗺️'  },
  3:    { label: 'Logística & Supply',                icon: '🚛'  },
  4:    { label: 'Donos e Sócios',                    icon: '🤝'  },
  5:    { label: 'Executivos',                        icon: '👔'  },
  6:    { label: 'Sinais de Venda',                   icon: '📈'  },
  7:    { label: 'Storytelling',                      icon: '✍️'  },
  8:    { label: 'Recomendações de Produtos Senior',  icon: '🏆'  },
};

const STATUS_ICON_MAP: Record<StatusPhaseKey, string> = {
  intent:       '🧭',
  complexity:   '🧠',
  context:      '🧩',
  history:      '🗂️',
  enrichment:   '🧬',
  prompt:       '🧱',
  deepResearch: '🔭',
  benchmark:    '📊',
  knowledgeBase:'📚',
  model:        '🤖',
  validation:   '🧪',
  synthesis:    '📝',
  finalReview:  '✅',
  response:     '✍️',
  hooks:        '🎯',
  cadastral:    '🏢',
  corporate:    '🌐',
  tech:         '💻',
  compliance:   '⚖️',
  rh:           '👥',
  logistica:    '🚛',
  fiscal:       '💰',
  territorio:   '🗺️',
  scoring:      '🎯',
  consolidando: '📋',
  rag:          '📚',
  concorrentes: '🔍',
};

function parseLivePhaseStatus(status: string): RichLoadingStatus | null {
  const match = status.match(/^(?:Executando\s+)?Fase\s*(-?\d+)\s*:/i);
  if (!match) return null;
  const phaseNumber = Number.parseInt(match[1], 10);
  const phase = LIVE_PHASE_LABELS[phaseNumber];
  if (!Number.isFinite(phaseNumber) || !phase) return null;
  return {
    label: `Fase ${phaseNumber}: ${phase.label}`,
    icon: phase.icon,
    category: 'fase',
    phaseNumber,
  };
}

function matchCategory(status: string): { key: StatusPhaseKey; extra?: string } | null {
  const s = status.trim();
  if (/^(Capturando intenção tática|Entendendo o objetivo da pergunta|Mapeando objetivo estratégico)/i.test(s)) return { key: 'intent' };
  if (/^(Avaliando profundidade|Entendendo sua necessidade|Analisando complexidade)/i.test(s))   return { key: 'complexity' };
  if (/^(Consolidando perímetro|Preparando contexto)/i.test(s)) return { key: 'context' };
  if (/^(Recuperando inteligência|Organizando histórico da conversa)/i.test(s)) return { key: 'history' };
  if (/^(Enriquecendo sinais e contexto comercial estratégico|Enriquecendo sinais e contexto comercial|Enriquecendo contexto comercial)/i.test(s)) return { key: 'enrichment' };
  if (/^(Orquestrando protocolo de investigação forense|Orquestrando protocolo de análise|Montando protocolo de análise)/i.test(s)) return { key: 'prompt' };
  if (/^(Infiltrando em fontes externas|Deep Research ativado|Sinais externos em análise)/i.test(s))      return { key: 'deepResearch' };
  if (/^Buscando histórico de/i.test(s)) {
    const rawCompany = s.replace(/^Buscando histórico de\s*/i, '').replace(/\.{0,3}\s*$/, '').trim();
    return { key: 'deepResearch', extra: rawCompany };
  }
  if (/^(Auditando referências|Mapeando benchmarks|Cruzando referências de mercado)/i.test(s))   return { key: 'benchmark' };
  if (/^(Consultando inteligência Senior|Consultando bases de conhecimento|Consultando inteligência interna)/i.test(s)) return { key: 'knowledgeBase' };
  if (/^base RAG/i.test(s)) return { key: 'rag' };
  if (/^(Processando em motores de inferência tática|Consultando modelo analítico|Consultando modelo de IA|Processando no modelo)/i.test(s)) return { key: 'model' };
  if (/^(Validando integridade|Validando consistência|Validando coerência|Validando achados)/i.test(s)) return { key: 'validation' };
  if (/^(Sintetizando narrativa executiva de alto impacto|Sintetizando resposta executiva)/i.test(s)) return { key: 'synthesis' };
  if (/^(Auditando consistência final|Revisando consistência final|Revisando entrega final|Auditando consistência final da entrega)/i.test(s)) return { key: 'finalReview' };
  if (/^(Materializando recomendações práticas|Gerando resposta|Montando resposta prática)/i.test(s))            return { key: 'response' };
  if (/^(Preparando ganchos para fechamento|Gerando ganchos|Preparando próximos passos)/i.test(s))            return { key: 'hooks' };
  if (/^(Rastreando registros cadastrais|Consultando dados cadastrais|Buscando CNPJ|dados da empresa)/i.test(s)) return { key: 'cadastral' };
  if (/^(Desconstruindo teia societária|Mapeando teia societária|sócios|grupos econômicos)/i.test(s))     return { key: 'corporate' };
  if (/^(Analisando stack tecnológico|Analisando stack|stack tecnológico|sistemas utilizados)/i.test(s)) return { key: 'tech' };
  if (/^(Escaneando riscos fiscais|Verificando compliance|riscos fiscais|SINTEGRA|SEFAZ)/i.test(s))  return { key: 'compliance' };
  if (/^(Mapeando centro de gravidade|Analisando RH|decisores|gestores|diretores)/i.test(s))            return { key: 'rh' };
  if (/^(Investigando malha logística|Investigando logística|supply chain|frota|armazenagem)/i.test(s)) return { key: 'logistica' };
  if (/^(Auditando incentivos|Verificando incentivos fiscais|benefícios fiscais)/i.test(s))     return { key: 'fiscal' };
  if (/^(Mapeando inteligência territorial estratégica|Mapeando inteligência territorial|contexto regional|região)/i.test(s)) return { key: 'territorio' };
  if (/^(Calibrando Score PORTA|Calculando Score|PORTA score)/i.test(s))                          return { key: 'scoring' };
  if (/^(Consolidando dossiê de inteligência final|Consolidando dossiê|dossiê final|relatório final)/i.test(s))     return { key: 'consolidando' };
  if (/^(Mapeando ecossistema competitivo regional|Cruzando concorrentes|concorrentes regionais|mapeamento competitivo)/i.test(s)) return { key: 'concorrentes' };
  return null;
}

export function toRichStatus(rawStatus?: string | null): RichLoadingStatus | null {
  const status = rawStatus?.trim();
  if (!status) return null;

  const livePhase = parseLivePhaseStatus(status);
  if (livePhase) return livePhase;

  const matched = matchCategory(status);
  if (matched) {
    const key = matched.key;
    let label: string = STATUS_PHASES[key];
    if (key === 'deepResearch' && matched.extra) {
      const safeCompany = sanitizeLoadingContextText(matched.extra);
      if (safeCompany) label = `Buscando histórico de ${safeCompany}...`;
    }
    return { label, icon: STATUS_ICON_MAP[key], category: key };
  }

  return null;
}

// Retrocompatibilidade — usada em ChatInterface e outros locais
export function isPhaseTimelineStatus(status: string): boolean {
  return /^(?:Executando\s+)?Fase\s*-?\d+\s*:/i.test(status.trim());
}

export function normalizeLoadingStatus(rawStatus?: string | null): string | null {
  return toRichStatus(rawStatus)?.label ?? null;
}

function sanitizeStatusLabel(rawStatus?: string | null): string {
  return (normalizeLoadingStatus(rawStatus) ?? rawStatus ?? '').trim();
}

function isIgnorableLoadingStatus(status?: string | null): boolean {
  const sanitized = sanitizeStatusLabel(status);
  if (!sanitized) return true;
  return /^(realizando pesquisa|iniciando an[aá]lise|preparando an[aá]lise|processando)\.\.\.$/i.test(sanitized);
}

function appendCompletedStage(completedStages: string[], stage?: string | null): string[] {
  const sanitizedStage = sanitizeStatusLabel(stage);
  if (!sanitizedStage || isIgnorableLoadingStatus(sanitizedStage)) return [...completedStages];

  const stageIdentifier = statusKey(sanitizedStage);
  if (completedStages.some(existing => statusKey(existing) === stageIdentifier)) {
    return [...completedStages];
  }

  return [...completedStages, sanitizedStage];
}

export interface LoadingProgressSnapshot {
  stage: string;
  completedStages: string[];
}

export function transitionLoadingProgress(
  currentStage: string | null | undefined,
  nextStage: string | null | undefined,
  completedStages: string[] = [],
): LoadingProgressSnapshot {
  const sanitizedNext = sanitizeStatusLabel(nextStage);
  const sanitizedCurrent = sanitizeStatusLabel(currentStage);
  const safeCompleted = Array.isArray(completedStages) ? [...completedStages] : [];

  if (!sanitizedNext) {
    return {
      stage: sanitizedCurrent,
      completedStages: safeCompleted,
    };
  }

  if (!sanitizedCurrent || statusKey(sanitizedCurrent) === statusKey(sanitizedNext)) {
    return {
      stage: sanitizedNext,
      completedStages: safeCompleted,
    };
  }

  return {
    stage: sanitizedNext,
    completedStages: appendCompletedStage(safeCompleted, sanitizedCurrent),
  };
}

export function finalizeLoadingProgress(
  currentStage: string | null | undefined,
  completedStages: string[] = [],
): LoadingProgressSnapshot {
  const safeCompleted = Array.isArray(completedStages) ? [...completedStages] : [];
  return {
    stage: '',
    completedStages: appendCompletedStage(safeCompleted, currentStage),
  };
}

export function statusKey(status: string): string {
  const rich = toRichStatus(status);
  if (!rich) return status;
  if (rich.category === 'fase' && rich.phaseNumber !== undefined) return `fase_${rich.phaseNumber}`;
  if (rich.category === 'deepResearch' && /^Buscando histórico de/i.test(rich.label)) return 'historico';
  if (rich.category === 'response') return 'resposta';
  return rich.category;
}
