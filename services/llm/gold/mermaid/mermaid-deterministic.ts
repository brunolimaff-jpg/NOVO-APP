/**
 * SCOUT-V7-GOLD-EXPERIENCE-01C — CANONICAL MERMAID (Planejador 2026-08-10).
 *
 * Builder determinístico dos 3 mapas do Gold. O Composer NÃO escreve mais
 * código Mermaid: ele produz texto seguro; aqui os diagramas são montados
 * com a gramática/paleta literal já existente no Scout atual
 * (prompts/mega/foundation.ts, fixtures 01-raio-x-operacional.md e
 * SELLER_BRIEF_MODULE_OUTPUT_CONTRACT):
 *
 *   graph LR  (nunca flowchart TD / graph TD / graph TB)
 *   classDef core fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;
 *   classDef satellite fill:#f0fdf4,stroke:#10b981,stroke-width:2px,color:#064e3b;
 *   classDef danger fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#881337;
 *   classDef warning fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#78350f;
 *   classDef neutral fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,stroke-width:1px,color:#475569;
 *   labels curtos entre aspas; classes declaradas em linhas separadas no fim;
 *   sem <br/>; sem emoji dentro do código Mermaid.
 *
 * Conteúdo: somente fatos do SAFE PACK e do CANONICAL. Nenhum nome QSA
 * nominal nos nós (Teia usa apenas CNPJs/empresas da whitelist).
 * Claims antigos inseguros (gap/TMS/dor) NÃO são reutilizados.
 */
import type { CanonicalAccount, SafeFindingPack } from '../gold-contracts';
import type { ScoutSegment } from '../../query-planner';
import { normalizeCnpj } from '../canonical-relation-resolver';

/** Paleta canônica literal do Scout (foundation.ts + fixtures). */
export const MERMAID_CANONICAL_PALETTE = {
  core: 'classDef core fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;',
  satellite: 'classDef satellite fill:#f0fdf4,stroke:#10b981,stroke-width:2px,color:#064e3b;',
  danger: 'classDef danger fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#881337;',
  warning: 'classDef warning fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#78350f;',
  neutral: 'classDef neutral fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,stroke-width:1px,color:#475569;',
} as const;

/** Ordem das classDef (canônica: core, satellite, danger, warning, neutral). */
const PALETTE_ORDER: Array<keyof typeof MERMAID_CANONICAL_PALETTE> = [
  'core',
  'satellite',
  'danger',
  'warning',
  'neutral',
];

/** CNPJ com máscara a partir de dígitos; se não for CNPJ, retorna o original. */
function maskCnpj(value: string): string {
  const digits = normalizeCnpj(value);
  if (!digits || digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Monta o cabeçalho canônico do bloco Mermaid (graph LR + paleta). */
function mermaidHeader(): string[] {
  return ['graph LR', ...PALETTE_ORDER.map((k) => MERMAID_CANONICAL_PALETTE[k])];
}

/** Envolve o corpo no bloco ```mermaid ... ``` com header canônico, classes no fim e LEGENDA FORA do fence. */
function wrapMermaid(lines: string[], classes: string[], legend: string): string {
  const chart = ['```mermaid', ...mermaidHeader(), ...lines, ...classes, '```'].join('\n');
  return `${chart}\n\n*${legend}*`;
}

/** ID de nó seguro (letra + índice). */
function nodeId(prefix: string, index: number): string {
  return `${prefix}${index}`;
}

/** Label quotado com aspas duplas, sem <br/> e sem emoji. */
function quotedLabel(label: string): string {
  const clean = label
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
  return `"${clean.replace(/"/g, "'")}"`;
}

/** Fatos confirmados do SafePack agrupados por tipo de claim. */
function confirmedFacts(safePack: SafeFindingPack) {
  return (safePack.facts ?? []).filter((f) => f.status === 'Confirmado');
}

/** Normalização simples de nome de entidade (mesma semântica do verifier). */
function normalizeEntityName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * LOTE GOLD P0 (RED A): fatos Confirmados de OUTRA entidade carregam a
 * identidade da entidade no conteúdo determinístico. Sem isso, o verifier
 * interpreta a frase como claim da CONTA canônica e a reconciliação falha
 * por entidade (UNSUPPORTED_PRODUCT_CLAIM fabricado por conteúdo que nós
 * mesmos injetamos). Fato da própria conta permanece como hoje.
 */
function withEntityIdentity(claim: string, entity: string, accountName: string | undefined): string {
  const isAccount = Boolean(accountName) && normalizeEntityName(entity) === normalizeEntityName(accountName ?? '');
  return isAccount ? claim : `${entity}: ${claim}`;
}

/**
 * Mapa 1 — Mapa do Caos Operacional (seção 2 PERFIL).
 *
 * EXPERIENCE-01C (fix Planejador 2026-08-10 — BLOQUEADOR 2):
 * "nó verdadeiro não autoriza seta". O contrato atual NÃO tem evidência
 * estruturada de relação entre processos — logo o builder NÃO pode criar
 * cadeias (Campo → Recepção → UBA) nem ligar tecnologia a um fato
 * arbitrário. O mapa representa os PROCESSOS CONFIRMADOS como nós
 * independentes ao redor da operação principal, SEM arestas inventadas:
 *   - operação principal (core);
 *   - processos operacionais confirmados (satellite) — SEM setas;
 *   - métricas NUNCA viram elo operacional (ficam fora do mapa);
 *   - tecnologia confirmada vira nó warning — SEM ligação arbitrária.
 * Quando houver relação estruturada no SafePack (same_root /
 * direct_pj_relation), ela pode gerar aresta — nunca a ausência dela.
 */
function buildChaosMap(safePack: SafeFindingPack): string | null {
  const facts = confirmedFacts(safePack);
  if (facts.length < 2) return null;

  // Processos operacionais confirmados (SEM métricas — não são elos).
  const operationFacts = facts.filter((f) => f.kind === 'operation');
  if (operationFacts.length < 1) return null;

  const lines: string[] = [];
  const classes: string[] = [];

  // Nó raiz: conta-alvo (core).
  const rootId = nodeId('A', 0);
  lines.push(`${rootId}[${quotedLabel('Operação principal')}]`);
  classes.push(`class ${rootId} core;`);

  // Processos operacionais confirmados como nós independentes (sem arestas
  // inventadas — o contrato não comprova a sequência entre eles).
  // POST-MERMAID-INVARIANT-01: claim INTEGRAL — truncar em 57+"..." destruía
  // a reconciliação de medida do verifier (UNSUPPORTED_PRODUCT_CLAIM). A
  // compactação visual é débito de UX, não regra semântica.
  operationFacts.slice(0, 6).forEach((fact, i) => {
    const id = nodeId('B', i + 1);
    lines.push(`${id}[${quotedLabel(withEntityIdentity(fact.claim, fact.entity, safePack.accountIdentity?.legalName))}]`);
    classes.push(`class ${id} satellite;`);
  });

  // Tecnologia confirmada — nó warning, SEM ligação arbitrária a processo.
  const techFacts = facts.filter((f) => f.kind === 'technology');
  if (techFacts.length > 0) {
    const techId = nodeId('C', 1);
    const techLabel = techFacts
      .map((f) => withEntityIdentity(f.claim, f.entity, safePack.accountIdentity?.legalName))
      .join(' | ');
    lines.push(`${techId}[${quotedLabel(techLabel)}]`);
    classes.push(`class ${techId} warning;`);
  }

  return wrapMermaid(
    lines,
    classes,
    'Legenda: azul (core) = operação principal confirmada; verde (satellite) = processo operacional confirmado; amarelo (warning) = tecnologia confirmada.',
  );
}

/**
 * Mapa 2 — Teia Societária (seção 3 ESTRUTURA SOCIETÁRIA).
 * Somente empresas/CNPJs da whitelist: conta alvo, matriz (headOffice),
 * directPjPartners e safePack.relationships. NENHUM nó pessoa/QSA.
 * Mesma gramática da fixture (labels quotados, classes no fim).
 *
 * EXPERIENCE-01C (fix Planejador 2026-08-10 — BLOQUEADOR 3):
 * o estado epistemológico NUNCA é comunicado só por cor/seta:
 *   - relação Confirmado → seta normal (==> direta / -.-> lateral);
 *   - relação NÃO confirmada (Pista/A validar) → nó com label "A validar",
 *     SEM seta (o texto carrega a incerteza, não a cor);
 *   - legenda textual determinística no fim do mapa.
 */
function buildTeiaMap(canonical: CanonicalAccount, safePack: SafeFindingPack): string {
  const lines: string[] = [];
  const classes: string[] = [];
  const ids = new Map<string, string>();
  let idx = 0;
  const getId = (cnpj: string): string => {
    const digits = normalizeCnpj(cnpj);
    const key = digits ?? cnpj;
    if (!ids.has(key)) {
      ids.set(key, nodeId('A', idx++));
    }
    return ids.get(key)!;
  };

  // Conta alvo (core).
  const targetId = getId(canonical.inputCnpj);
  lines.push(`${targetId}[${quotedLabel(`${canonical.legalName} — ${maskCnpj(canonical.inputCnpj)}`)}]`);
  classes.push(`class ${targetId} core;`);

  // Matriz (headOffice), se houver.
  if (canonical.headOfficeCnpj) {
    const headId = getId(canonical.headOfficeCnpj);
    const headLabel = canonical.headOfficeLegalName ?? 'Matriz';
    lines.push(`${headId}[${quotedLabel(`${headLabel} — ${maskCnpj(canonical.headOfficeCnpj)}`)}]`);
    lines.push(`${headId} ==> ${targetId}`);
    classes.push(`class ${headId} satellite;`);
  }

  // Sócias PJ diretas (directPjPartners) — relação direta.
  const emittedEdges = new Set<string>();
  const emittedClasses = new Set<string>();
  const emitEdge = (from: string, to: string, arrow: string): void => {
    const key = `${from}|${arrow}|${to}`;
    if (emittedEdges.has(key)) return;
    emittedEdges.add(key);
    lines.push(`${from} ${arrow} ${to}`);
  };
  const emitClass = (cls: string): void => {
    if (emittedClasses.has(cls)) return;
    emittedClasses.add(cls);
    classes.push(cls);
  };
  for (const partner of canonical.directPjPartners ?? []) {
    const partnerId = getId(partner.cnpj);
    lines.push(`${partnerId}[${quotedLabel(`${partner.legalName} — ${maskCnpj(partner.cnpj)}`)}]`);
    emitEdge(partnerId, targetId, '==>');
    emitClass(`class ${partnerId} satellite;`);
  }

  // Relações do SafePack (whitelist de CNPJ; não inventa nome).
  // Só relação Confirmado vira aresta; não-confirmado vira nó "A validar"
  // SEM seta (estado epistemológico em texto, nunca só em cor).
  // B3.2 (Planejador 2026-08-10): CANONICAL VENCE — CNPJ já presente no
  // target/headOffice/directPjPartners NÃO pode ser rebaixado nem reescrito
  // por relação mais fraca do SafePack (Pista inicial etc.).
  const canonicalCnpjs = new Set<string>();
  for (const c of [canonical.inputCnpj, canonical.headOfficeCnpj, ...(canonical.directPjPartners ?? []).map((p) => p.cnpj)]) {
    const d = c ? normalizeCnpj(c) : null;
    if (d) canonicalCnpjs.add(d);
  }
  for (const rel of safePack.relationships ?? []) {
    const digits = normalizeCnpj(rel.relatedEntity);
    if (!digits) continue;
    const relId = getId(rel.relatedEntity);
    const isCanonicalNode = canonicalCnpjs.has(digits);
    const hasName = !(rel.relatedEntity.includes('CNPJ') || rel.relatedEntity === rel.relatedEntity.toUpperCase());
    // Quando não há nome empresarial seguro, o label é só o CNPJ (sem
    // duplicar: "CNPJ 12.345.678/0001-90", nunca "CNPJ X — X").
    const baseLabel = hasName ? rel.relatedEntity : `CNPJ ${maskCnpj(rel.relatedEntity)}`;
    const fullLabel = hasName ? `${rel.relatedEntity} — ${maskCnpj(rel.relatedEntity)}` : baseLabel;
    const confirmed = rel.status === 'Confirmado';
    const labelSuffix = confirmed || isCanonicalNode ? '' : ' (A validar)';
    // Evita duplicar nós já emitidos (matriz/partner com mesmo CNPJ).
    if (!lines.some((l) => l.includes(relId))) {
      lines.push(`${relId}[${quotedLabel(`${fullLabel}${labelSuffix}`)}]`);
    } else if (!confirmed && !isCanonicalNode) {
      // Nó novo (só do SafePack) com pista: reescreve o label com incerteza
      // (sem duplicar a declaração). Nó canônico NUNCA é reescrito.
      const idx = lines.findIndex((l) => l.includes(relId));
      if (idx !== -1) {
        lines[idx] = `${relId}[${quotedLabel(`${fullLabel}${labelSuffix}`)}]`;
      }
    }
    if (confirmed) {
      // Relação direta → seta para a conta; lateral → seta tracejada.
      if (rel.relationType === 'direct_pj_relation' || rel.relationType === 'same_root') {
        emitEdge(relId, targetId, '==>');
        emitClass(`class ${relId} satellite;`);
      } else {
        emitEdge(relId, targetId, '-.->');
        emitClass(`class ${relId} warning;`);
      }
    } else if (!isCanonicalNode) {
      // Não-confirmado (e não canônico): nó com incerteza em texto, sem seta.
      emitClass(`class ${relId} neutral;`);
    }
  }

  return wrapMermaid(
    lines,
    classes,
    'Legenda: azul (core) = entidade confirmada; verde (satellite) = relação direta confirmada; amarelo (warning) = relação lateral confirmada; cinza (neutral) = a validar.',
  );
}

/**
 * Mapa 3 — Caminho da Venda (seção 9 PRÓXIMOS PASSOS).
 * Fluxo comercial conceitual determinístico: Evidência segura → Hipótese
 * comercial → Discovery → Problema confirmado? → (SIM) Sponsor/Owner →
 * Dimensionar impacto → Movimento comercial; (NÃO) Nutrir/Encerrar.
 * Mesma gramática do atual Mapa da Estratégia de Entrada (builders.ts),
 * com a semântica segura Gold (evidência → hipótese → discovery → decisão).
 */
function buildSalesPathMap(): string {
  const lines = [
    'A["Evidência segura"] ==> B["Hipótese comercial"]',
    'B ==> C["Discovery: validar dor"]',
    'C ==> D{"Problema confirmado?"}',
    'D -- Sim ==> E["Definir sponsor e owner"]',
    'E ==> F["Dimensionar impacto"]',
    'F ==> G["Movimento comercial"]',
    'D -- Não ==> H["Nutrir ou encerrar hipótese"]',
  ];
  const classes = [
    'class A core;',
    'class B,C core;',
    'class D warning;',
    'class E,F,G core;',
    'class H neutral;',
  ];
  return wrapMermaid(
    lines,
    classes,
    'Legenda: azul (core) = etapa confirmada do caminho; amarelo (warning) = ponto de decisão; cinza (neutral) = saída alternativa.',
  );
}

interface ValueChainRow {
  elo: string;
  dimension: string;
  status: string;
  evidence: string;
  commercialReading: string;
  validate: string;
}

const SEGMENT_VALUE_CHAIN: Record<ScoutSegment, Array<{ pattern: RegExp; label: string }>> = {
  agropecuaria: [
    { pattern: /produ[cç][aã]o|cultivo|safra|campo/i, label: 'Produção' },
    { pattern: /armazen|estoque|silo/i, label: 'Armazenagem' },
    { pattern: /benefici|processamento/i, label: 'Beneficiamento' },
    { pattern: /log[ií]st|transporte|entrega/i, label: 'Logística' },
    { pattern: /rastreab|certifica[cç]/i, label: 'Rastreabilidade' },
  ],
  agroindustria: [
    { pattern: /suprimento|insumo/i, label: 'Suprimentos' },
    { pattern: /produ[cç][aã]o|fabrica[cç][aã]o|processamento/i, label: 'Produção' },
    { pattern: /benefici|qualidade/i, label: 'Beneficiamento e qualidade' },
    { pattern: /armazen|estoque/i, label: 'Armazenagem' },
    { pattern: /log[ií]st|transporte|distribui[cç]/i, label: 'Logística' },
  ],
  construcao: [
    { pattern: /suprimento|compras|insumo/i, label: 'Suprimentos' },
    { pattern: /obra|constru[cç]|projeto/i, label: 'Obra' },
    { pattern: /qualidade|licen[cç]|seguran[cç]/i, label: 'Qualidade e conformidade' },
    { pattern: /manuten[cç]/i, label: 'Manutenção' },
    { pattern: /entrega|cliente/i, label: 'Entrega' },
  ],
  logistica: [
    { pattern: /compras|aquisi[cç]/i, label: 'Compras' },
    { pattern: /transporte|frota|entrega/i, label: 'Transporte' },
    { pattern: /estoque|armazen|invent[aá]rio/i, label: 'Estoque' },
    { pattern: /centro de distribui[cç]|cd\b|distribui[cç]/i, label: 'Distribuição' },
    { pattern: /canal|cliente/i, label: 'Canais' },
  ],
  hcm_intensivo: [
    { pattern: /aquisi[cç]|contrata[cç]/i, label: 'Aquisição' },
    { pattern: /opera[cç]|folha|ponto/i, label: 'Operação' },
    { pattern: /entrega|servi[cç]/i, label: 'Entrega' },
    { pattern: /atendimento|cliente/i, label: 'Atendimento' },
    { pattern: /renova[cç]|reten[cç]/i, label: 'Renovação' },
  ],
  industrial_geral: [
    { pattern: /suprimento|compras|insumo/i, label: 'Suprimentos' },
    { pattern: /produ[cç][aã]o|fabrica[cç]|processamento/i, label: 'Produção' },
    { pattern: /qualidade|conformidade/i, label: 'Qualidade' },
    { pattern: /manuten[cç]/i, label: 'Manutenção' },
    { pattern: /distribui[cç]|log[ií]st|transporte/i, label: 'Distribuição' },
  ],
};

function truncateCell(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function statusBadge(status: string): string {
  return status === 'Confirmado' ? '✅ Confirmado' : '🟠 A validar';
}

function valueChainDimension(value: string, kind: string, segment: ScoutSegment): string {
  const match = SEGMENT_VALUE_CHAIN[segment].find((entry) => entry.pattern.test(value));
  if (match) return match.label;
  if (kind === 'technology') return 'Tecnologia';
  if (kind === 'relationship') return 'Relações';
  if (kind === 'metric' || kind === 'financial') return 'Indicadores';
  return 'Operação';
}

function valueChainElo(dimension: string): string {
  return dimension.toLowerCase();
}

/**
 * BRU-100 (despacho do Planejador, run 59d210b0): a coluna Validar da tabela
 * de elos copia as perguntas abertas CRUAS para o conteúdo determinístico.
 * O verifier quebra o texto por pontuação e avalia cada trecho contra o padrão
 * de claim protegido — uma pergunta legítima ("Qual é a capacidade de
 * armazenagem?") perde o "?" e vira afirmação de capacidade sem fonte →
 * UNSUPPORTED_PRODUCT_CLAIM. A correção é fazer o determinístico obedecer ao
 * contrato semântico do Composer (não resolver no verifier): a coluna Validar
 * preserva a intenção de discovery com vocabulário NEUTRO e SEM valores não
 * comprovados — ex.: "Qual é a capacidade estática total de armazenagem?" →
 * "Qual é o volume total de armazenagem?".
 */
const PROTECTED_CLAIM_VALUE_PATTERN =
  /(?:\d+(?:[.,]\d+)?\s*(?:milh[oõ]es?|mil|sacas|toneladas|t\b|m³|m3|litros|kg))\b/gi;

const PROTECTED_CLAIM_VOCAB_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcapacidade\s+est[áa]tica\b/gi, 'volume'],
  [/\bcapacidade\s+produtiva\b/gi, 'volume'],
  [/\bcapacidade\s+de\s+armazenagem\b/gi, 'volume de armazenagem'],
  [/\bcapacidade\s+de\s+(produ[cç][aã]o|fabrica[cç][aã]o|processamento|esmagamento|moagem|refino|opera[cç][aã]o|atendimento|estocagem|est[óo]cagem)\b/gi, 'volume de $1'],
  [/\bcapacidade\s+(anual|mensal)\b/gi, 'volume $1'],
  [/\bprodu[cç][aã]o\s+de\b/gi, 'volume de'],
  [/\broi\b/gi, 'resultado'],
  [/\bretorno\s+sobre\b/gi, 'resultado sobre'],
  [/\bintegra[cç][aã]o\s+nativa\b/gi, 'integração'],
  [/\bmiddleware\b/gi, 'plataforma'],
];

/** Marcadores de pergunta (interrogativa) — a normalização só se aplica a
 *  perguntas de discovery; afirmações NÃO são mascaradas (continuam sujeitas
 *  ao verifier — um claim de capacidade sem prova deve continuar FAIL). */
const INTERROGATIVE_MARKER = /\?|\b(qual|como|quando|onde|por\s+que|existe|h[aá]|é\s+poss[ií]vel|pode|seria|quanto|qual\s+é)\b/i;

function normalizeDiscoveryQuestion(question: string): string {
  if (!INTERROGATIVE_MARKER.test(question.trim())) return question;
  let normalized = question
    .replace(PROTECTED_CLAIM_VALUE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  for (const [pattern, replacement] of PROTECTED_CLAIM_VOCAB_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s{2,}/g, ' ').trim();
}

function validationForDimension(openQuestions: string[], dimension: string): string {
  const match = openQuestions.find((question) => {
    const questionLower = question.toLowerCase();
    return dimension.toLowerCase().split(/\s+e\s+|\s+/).some((token) => token.length > 4 && questionLower.includes(token));
  });
  return match ? truncateCell(normalizeDiscoveryQuestion(match), 140) : '—';
}

export function buildDynamicValueChainTable(
  safePack: SafeFindingPack,
  segment: ScoutSegment = 'industrial_geral',
): string | null {
  const rows: ValueChainRow[] = [];
  const openQuestions = safePack.openQuestions ?? [];

  for (const fact of safePack.facts ?? []) {
    if (fact.status !== 'Confirmado') continue;
    const dimension = valueChainDimension(fact.claim, fact.kind, segment);
    rows.push({
      elo: valueChainElo(dimension),
      dimension,
      status: statusBadge(fact.status),
      // LOTE GOLD P0 (RED A/B): claim INTEGRAL com identidade da entidade —
      // o texto validado pelo verifier nunca sofre truncamento semântico
      // (compactação visual pertence ao renderer, não a esta representação).
      evidence: withEntityIdentity(fact.claim, fact.entity, safePack.accountIdentity?.legalName).replace(/\|/g, '/'),
      commercialReading: `Base confirmada para entender o elo de ${dimension.toLowerCase()}.`,
      validate: validationForDimension(openQuestions, dimension),
    });
  }

  for (const signal of safePack.technologySignals ?? []) {
    const dimension = valueChainDimension(signal.technology, 'technology', segment);
    rows.push({
      elo: valueChainElo(dimension),
      dimension: signal.technology,
      status: statusBadge(signal.status),
      evidence: signal.observedFact.replace(/\|/g, '/'),
      commercialReading: 'Escopo observado; confirmar cobertura antes de recomendar qualquer solução.',
      validate: truncateCell(normalizeDiscoveryQuestion(signal.validationQuestion), 140),
    });
  }

  for (const question of openQuestions) {
    const normalizedQuestion = normalizeDiscoveryQuestion(question);
    if (rows.some((row) => row.validate === normalizedQuestion)) continue;
    rows.push({
      elo: 'discovery',
      dimension: 'Discovery',
      status: '🟠 A validar',
      evidence: 'Pergunta aberta do dossiê',
      commercialReading: 'Tema ainda não comprovado; manter a conversa investigativa.',
      validate: truncateCell(normalizedQuestion, 140),
    });
  }

  if (rows.length === 0) return null;

  const order = SEGMENT_VALUE_CHAIN[segment].map((entry) => entry.label.toLowerCase());
  rows.sort((a, b) => {
    const aIndex = order.findIndex((label) => a.dimension.toLowerCase().includes(label));
    const bIndex = order.findIndex((label) => b.dimension.toLowerCase().includes(label));
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  });

  const tableRows = rows.map((row) => `| ${row.elo} | ${row.dimension} | ${row.status} | ${row.evidence} | ${row.commercialReading} | ${row.validate} |`);
  return [
    '### 🔗 MAPA DE ELOS DA CADEIA DE VALOR',
    '',
    '| Elo | Dimensão | Status | Evidência | Leitura comercial | Validar |',
    '| --- | --- | --- | --- | --- | --- |',
    ...tableRows,
  ].join('\n');
}

/**
 * Insere os mapas determinísticos no Gold:
 * 1. Remove QUALQUER bloco ```mermaid ... ``` existente (Mermaid livre do Composer);
 * 2. Injeta o Mapa do Caos e a tabela dinâmica na seção 2,
 *    a Teia Societária na seção 3 e o Caminho da Venda na seção 9.
 *
 * A inserção é feita logo após o heading da seção-alvo (### N. NOME).
 */
export function injectCanonicalGoldMermaids(
  goldBrief: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
  segment: ScoutSegment = 'industrial_geral',
): string {
  // 1) Remove todos os blocos Mermaid existentes.
  let gold = goldBrief.replace(/```mermaid\n?[\s\S]*?```\n?/gi, '');

  // 2) Mapa do Caos + Elos na seção 2 (PERFIL).
  const chaos = buildChaosMap(safePack);
  const valueChainTable = buildDynamicValueChainTable(safePack, segment);
  if (chaos || valueChainTable) {
    const visualBlock = [chaos, valueChainTable].filter(Boolean).join('\n\n');
    gold = gold.replace(/^###\s*2\.\s*PERFIL[^\n]*$/mi, (m) => `${m}\n\n${visualBlock}`);
  }

  // 3) Teia Societária na seção 3 (ESTRUTURA SOCIETÁRIA).
  const teia = buildTeiaMap(canonical, safePack);
  if (teia) {
    gold = gold.replace(/^###\s*3\.\s*ESTRUTURA SOCIETÁRIA[^\n]*$/mi, (m) => `${m}\n\n${teia}`);
  }

  // 4) Caminho da Venda na seção 9 (PRÓXIMOS PASSOS).
  const sales = buildSalesPathMap();
  gold = gold.replace(/^###\s*9\.\s*PRÓXIMOS PASSOS[^\n]*$/mi, (m) => `${m}\n\n${sales}`);

  return gold;
}
