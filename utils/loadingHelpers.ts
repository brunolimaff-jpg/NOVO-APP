import { ChatMode } from "../constants";

export type Pillar = 'GATEC' | 'ERP' | 'HCM' | 'INTEGRACAO' | 'CONCILIACAO' | 'GERAL';

interface InsightDatabase {
  investigacao: string[];
}

const shownFacts = new Set<string>();

export function resetShownFacts() {
  shownFacts.clear();
}

export function cleanFactPrefix(fact: string): string {
  return fact
    .replace(/^(Você sabia\?|Dado:|Fato:|Insight:|Radar:|Nota:|Contexto:|Tendência:|Curiosidade:)\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function getNextFact(pool: string[]): string {
  const available = pool.filter(f => !shownFacts.has(f));

  if (available.length === 0) {
    shownFacts.clear();
    const random = pool[Math.floor(Math.random() * pool.length)];
    shownFacts.add(random);
    return random;
  }

  const fact = available[Math.floor(Math.random() * available.length)];
  shownFacts.add(fact);
  return fact;
}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

const SHARED_FACTS = [
  "A Senior Sistemas atende mais de 13.000 grupos econômicos em 6 setores econômicos.",
  "O Brasil é um dos maiores polos globais de agronegócio e tecnologia aplicada ao campo.",
  "Empresas com integração entre operação, financeiro e pessoas tendem a reduzir retrabalho.",
  "O ERP Senior consolida múltiplos CNPJs de um grupo em uma única visão contábil.",
  "O HCM Senior gerencia contratos sazonais com apoio a admissão e desligamento em lote.",
  "Rastreabilidade e disciplina operacional aceleram auditoria, expansão e negociação comercial.",
].map(cleanFactPrefix);

const PILLAR_INSIGHTS: Record<Pillar, string[]> = {
  GATEC: shuffleArray([
    "Mapeando rotina de campo, talhões e rastreabilidade agrícola...",
    "Verificando sinais de mecanização, produtividade e gestão agrícola...",
    "Cruzando indicadores de safra, operação e capacidade de execução...",
    ...SHARED_FACTS,
  ]),
  ERP: shuffleArray([
    "Consultando sinais fiscais, financeiros e de maturidade de gestão...",
    "Verificando obrigações acessórias, integração e consistência operacional...",
    "Analisando estrutura de backoffice, compras, estoque e faturamento...",
    ...SHARED_FACTS,
  ]),
  HCM: shuffleArray([
    "Estimando estrutura de pessoas, segurança e processos trabalhistas...",
    "Mapeando sinais de RH, lideranças e disciplina de rotina operacional...",
    "Verificando contexto de folha, sindicatos e gestão de equipes...",
    ...SHARED_FACTS,
  ]),
  INTEGRACAO: shuffleArray([
    "Avaliando conectividade, APIs, automação e fluxo de dados...",
    "Cruzando sinais de maturidade digital e integração entre sistemas...",
    "Verificando gargalos entre operação, financeiro e plataformas externas...",
    ...SHARED_FACTS,
  ]),
  CONCILIACAO: shuffleArray([
    "Analisando logística, armazenagem, expedição e referências de mercado...",
    "Mapeando gargalos de supply, transporte e sincronismo operacional...",
    "Verificando consistência entre capacidade instalada e ritmo de execução...",
    ...SHARED_FACTS,
  ]),
  GERAL: shuffleArray([
    "Ligando o radar e consolidando contexto da conta...",
    "Buscando sinais públicos para reduzir incerteza comercial...",
    "Cruzando histórico, contexto cadastral e referências externas...",
    ...SHARED_FACTS,
  ]),
};

export const INSIGHTS: Record<Pillar, InsightDatabase> = {
  GATEC: { investigacao: PILLAR_INSIGHTS.GATEC },
  ERP: { investigacao: PILLAR_INSIGHTS.ERP },
  HCM: { investigacao: PILLAR_INSIGHTS.HCM },
  INTEGRACAO: { investigacao: PILLAR_INSIGHTS.INTEGRACAO },
  CONCILIACAO: { investigacao: PILLAR_INSIGHTS.CONCILIACAO },
  GERAL: { investigacao: PILLAR_INSIGHTS.GERAL },
};

function detectPillarFromStage(stage: string): Pillar {
  const s = stage.toLowerCase();

  if (s.match(/field|farm|crop|harvest|planting|machine|campo|lavoura|safra|plantio|colheita|rastreabil/)) return 'GATEC';
  if (s.match(/fiscal|tax|accounting|finance|procurement|stock|inventory|contabil|financeiro|imposto|compra|estoque/)) return 'ERP';
  if (s.match(/hr|people|employee|workforce|payroll|rh|gente|folha|ponto|colaborador|trabalhista/)) return 'HCM';
  if (s.match(/integration|api|connect|platform|fintech|bank|integracao|plataforma|banco|flow|bpm|ged/)) return 'INTEGRACAO';
  if (s.match(/logistics|wms|tms|freight|delivery|supply|logistica|frete|transporte|escoamento/)) return 'CONCILIACAO';

  return 'GERAL';
}

export function getInsightPool(mode: ChatMode, stage?: string): string[] {
  const pillar = stage ? detectPillarFromStage(stage) : 'GERAL';
  return INSIGHTS[pillar][mode];
}

export function getLongWaitMessages(_mode: ChatMode): string[] {
  return [
    "A análise está profunda. Buscando dados específicos...",
    "Cruzando referências para manter a consistência da investigação...",
    "Consultando múltiplas fontes para reduzir ruído e ambiguidade...",
    "Estruturando o dossiê antes da síntese final...",
  ];
}

export function humanizeStage(stage: string): string {
  const map: Record<string, string> = {
    search: 'Buscando Dados',
    analysis: 'Analisando',
    generation: 'Gerando Relatório',
    consolidation: 'Consolidando',
    init: 'Iniciando',
    saving: 'Salvando',
  };

  const lowerStage = stage.toLowerCase();
  for (const key of Object.keys(map)) {
    if (lowerStage.includes(key)) return map[key];
  }

  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function getRandomInsight(mode: ChatMode, stage?: string): string {
  const pool = getInsightPool(mode, stage);
  return getNextFact(pool);
}
