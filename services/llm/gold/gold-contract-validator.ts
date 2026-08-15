/**
 * V6 — GoldContractValidator determinístico.
 *
 * Complementa o EntityAwareGoldVerifier: enquanto o verifier valida
 * INVARIANTES SEMÂNTICOS (não inventar, não promover, não inverter), este
 * valida o CONTRATO ESTRUTURAL do Gold Brief (o que o verifier não cobre):
 *
 *  - 900–1500 palavras da NARRATIVA humana (exclui os blocos determinísticos
 *    injetados pós-Composer: Mermaid + tabela de elos)
 *  - 9 seções obrigatórias
 *  - 0–3 diagramas Mermaid
 *  - ≤ 3 sinais
 *  - 1 frente principal
 *  - ≤ 2 adjacências
 *  - 1 pergunta principal
 *  - exatamente 3 próximas ações
 *
 * Puro e determinístico (regex + contagem), zero chamada externa.
 */
export interface GoldContractViolation {
  code:
    | 'WORD_COUNT_OUT_OF_RANGE'
    | 'MISSING_SECTION'
    | 'MERMAID_LIMIT_EXCEEDED'
    | 'SIGNAL_LIMIT_EXCEEDED'
    | 'FRONT_LIMIT_EXCEEDED'
    | 'ADJACENCY_LIMIT_EXCEEDED'
    | 'QUESTION_LIMIT_EXCEEDED'
    | 'ACTION_COUNT_MISMATCH';
  detail: string;
}

export interface GoldContractResult {
  passed: boolean;
  violations: GoldContractViolation[];
  metrics: {
    wordCount: number;
    sectionsFound: string[];
    mermaidCount: number;
    signalCount: number;
    frontCount: number;
    adjacencyCount: number;
    questionCount: number;
    actionCount: number;
    /** BRU-103: assinatura estrutural das ações (somente contagens, sem texto). */
    actionFormats: { named: number; tableRows: number; numbered: number };
  };
}

const MIN_WORDS = 900;
const MAX_WORDS = 1500;
const MAX_MERMAID = 3;
const MAX_SIGNALS = 3;
const MAX_FRONTS = 1;
const MAX_ADJACENCIES = 2;
const EXPECTED_ACTIONS = 3;

const REQUIRED_SECTIONS = [
  'Síntese executiva',
  'Perfil e identidade',
  'Estrutura societária',
  'Tecnologia',
  'Pessoas-chave',
  'Indicadores',
  'Sinais',
  'Riscos',
  'Próximos passos',
] as const;

/** Padrões de seção tolerantes a variações de escrita (case/acento/plural). */
const SECTION_PATTERNS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'Síntese executiva', patterns: [/s[ií]ntese executiva/i, /executive summary/i] },
  { id: 'Perfil e identidade', patterns: [/perfil e identidade/i, /perfil da empresa/i, /identidade da empresa/i, /^\s*#{1,6}\s*\**\s*\d*\.?\s*perfil\b/im] },
  { id: 'Estrutura societária', patterns: [/estrutura societ[aá]ria/i, /estrutura do grupo/i, /societ[aá]rio/i] },
  { id: 'Tecnologia', patterns: [/tecnologia/i, /stack/i] },
  { id: 'Pessoas-chave', patterns: [/pessoas[- ]chave/i, /pessoas[- ]chaves/i, /pessoas/i] },
  { id: 'Indicadores', patterns: [/indicadores/i, /m[eé]tricas/i, /n[uú]meros/i] },
  { id: 'Sinais', patterns: [/sinais/i] },
  { id: 'Riscos', patterns: [/riscos/i, /pontos de aten[cç][aã]o/i, /bordas e gaps/i] },
  { id: 'Próximos passos', patterns: [/pr[oó]ximos passos/i, /pr[oó]ximas a[cç][oõ]es/i, /a[cç][oõ]es recomendadas/i] },
];

function countWords(text: string): number {
  // Palavras = sequências de letras/números (ignora markdown/ponctuação isolada)
  return (text.match(/[a-zA-ZÀ-ÿ0-9]+(?:['’-][a-zA-ZÀ-ÿ0-9]+)*/g) || []).length;
}

function countMermaid(text: string): number {
  return (text.match(/```mermaid/g) || []).length;
}

function countPattern(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const p of patterns) {
    total += (text.match(p) || []).length;
  }
  return total;
}

/**
 * BRU-103 (design congelado — Planejador 2026-08-14): 900–1500 é o orçamento
 * da NARRATIVA HUMANA do Gold. O builder injeta pós-Composer componentes
 * determinísticos (3 mapas Mermaid + tabela de elos) que inflam o artefato
 * final sem serem narrativa. O validator continua rodando no artefato final,
 * mas a contagem de palavras exclui SOMENTE esses blocos determinísticos —
 * tabelas escritas pelo Composer continuam contando.
 */
function stripDeterministicBlocks(text: string): string {
  let narrative = text.replace(/```mermaid\n?[\s\S]*?```\n?/gi, '');
  // Legenda dos mapas (parte do componente Mermaid, gerada fora do fence).
  narrative = narrative.replace(/^\s*\*Legenda:.*$/gim, '');
  // Tabela determinística de elos: heading único + linhas `|` consecutivas
  // (o builder troca `|` cru por "/" dentro das células).
  narrative = narrative.replace(
    /###\s*[^\n]*MAPA DE ELOS DA CADEIA DE VALOR[^\n]*(?:\n|$)(?:(?:\n)*\|[^\n]*(?:\n|$))*/g,
    '',
  );
  return narrative;
}

export function validateGoldContract(goldBrief: string): GoldContractResult {
  const violations: GoldContractViolation[] = [];
  const wordCount = countWords(stripDeterministicBlocks(goldBrief));
  const mermaidCount = countMermaid(goldBrief);

  // Seções presentes (tolerante)
  const sectionsFound: string[] = [];
  for (const section of SECTION_PATTERNS) {
    if (section.patterns.some((p) => p.test(goldBrief))) sectionsFound.push(section.id);
  }

  // Sinais (padrões de linha de sinal: "Sinal:", bullets com "sinal")
  const signalCount = countPattern(goldBrief, [/\bsinais?\b/gi, /\bsignal\b/gi]);
  // Frentes (menções de frente principal)
  const frontCount = countPattern(goldBrief, [/\bfrente\s+principal\b/gi, /\bfrente\s+de\s+atua[cç][aã]o\b/gi, /\bprincipal\s+frente\b/gi]);
  // Adjacências: conta apenas "Adjacência N:" explícitas (não o título da seção)
  const adjacencyCount = (goldBrief.match(/\badjac[êe]ncia\s+\d/gi) || []).length;
  // Perguntas principais
  const questionCount = countPattern(goldBrief, [/\bpergunta\s+principal\b/gi, /\bperguntas?\s+em\s+aberto\b/gi, /\bquest[aã]o\s+principal\b/gi]);
  // Ações: conta no bloco APÓS o ÚLTIMO header de ações (evita riscos
  // numerados e mermaid com "AÇÃO N" dentro de diagramas).
  const actionBlocks = goldBrief.split(/(?:\bpr[oó]ximos passos\b|\bpr[oó]ximas?\s+a[cç][oõ]es?\b|\brecomenda[çc][oõ]es?\b)/i);
  const actionSection = actionBlocks.length > 1 ? actionBlocks[actionBlocks.length - 1] : '';
  // Remove blocos mermaid e linhas de adjacências (não são ações)
  const actionClean = actionSection
    .replace(/```mermaid[\s\S]*?```/gi, '')
    .replace(/^\s*\**Adjac[êe]ncias?:?.*$/gim, '')
    .replace(/^\s*\**Frente\s+Principal:?.*$/gim, '');
  const namedActions = (actionClean.match(/\b(?:a[cç][aã]o|passo)\s+\d/gi) || []).length;
  const tableActions = (actionClean.match(/^\|\s*\*{0,2}\s*\d{1,2}\s*\*{0,2}\s*\|/gm) || []).length;
  // BRU-103 (RCA-07): o prompt orienta "negrito nos números-chave" — ações
  // numeradas podem sair como "**1.** Definir..." e o regex antigo não casava
  // (contava 1 → ACTION_COUNT_MISMATCH). Remove asteriscos antes de contar.
  const numberedActions = (actionClean.replace(/\*+/g, '').match(/(?:^|\s)(\d{1,2})[.)]\s*[*_]*\s*[A-ZÀ-Ú]/gm) || []).length;
  const actionCount = Math.max(
    1,
    namedActions > 0 ? namedActions : tableActions > 0 ? tableActions : numberedActions,
  );
  // BRU-103: assinatura estrutural não sensível da seção 9 — contagens por
  // formato (nomeado / tabela / numerado) para identificar a classe real do
  // ACTION_COUNT_MISMATCH sem regex cega nem conteúdo do Gold.
  const actionFormats = { named: namedActions, tableRows: tableActions, numbered: numberedActions };

  // 1) Palavras
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    violations.push({
      code: 'WORD_COUNT_OUT_OF_RANGE',
      detail: `${wordCount} palavras (contrato ${MIN_WORDS}–${MAX_WORDS})`,
    });
  }

  // 2) Seções obrigatórias
  const missing = REQUIRED_SECTIONS.filter((s) => !sectionsFound.includes(s));
  if (missing.length > 0) {
    violations.push({ code: 'MISSING_SECTION', detail: `faltam: ${missing.join(', ')}` });
  }

  // 3) Mermaid
  if (mermaidCount > MAX_MERMAID) {
    violations.push({ code: 'MERMAID_LIMIT_EXCEEDED', detail: `${mermaidCount} diagramas (máx ${MAX_MERMAID})` });
  }

  // 4) Sinais
  if (signalCount > MAX_SIGNALS) {
    violations.push({ code: 'SIGNAL_LIMIT_EXCEEDED', detail: `${signalCount} sinais (máx ${MAX_SIGNALS})` });
  }

  // 5) Frente principal
  if (frontCount > MAX_FRONTS) {
    violations.push({ code: 'FRONT_LIMIT_EXCEEDED', detail: `${frontCount} frentes principais (máx ${MAX_FRONTS})` });
  }

  // 6) Adjacências
  if (adjacencyCount > MAX_ADJACENCIES) {
    violations.push({ code: 'ADJACENCY_LIMIT_EXCEEDED', detail: `${adjacencyCount} adjacências (máx ${MAX_ADJACENCIES})` });
  }

  // 7) Pergunta principal
  if (questionCount > 1) {
    violations.push({ code: 'QUESTION_LIMIT_EXCEEDED', detail: `${questionCount} perguntas principais (máx 1)` });
  }

  // 8) Próximas ações
  if (actionCount !== EXPECTED_ACTIONS) {
    violations.push({ code: 'ACTION_COUNT_MISMATCH', detail: `${actionCount} próximas ações (esperado ${EXPECTED_ACTIONS})` });
  }

  return {
    passed: violations.length === 0,
    violations,
    metrics: {
      wordCount,
      sectionsFound,
      mermaidCount,
      signalCount,
      frontCount,
      adjacencyCount,
      questionCount,
      actionCount,
      actionFormats,
    },
  };
}
