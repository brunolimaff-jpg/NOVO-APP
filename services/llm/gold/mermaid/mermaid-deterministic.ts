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
 * arbitrário.
 *
 * BRU-119 P1 A' (Planejador 2026-08-17 — topology-first):
 * label do nó = DIMENSÃO CURTA (ex.: "Produção", "Logística"), NÃO claim
 * integral. O claim fica só na Tabela de Elos (evidence-first) e na
 * interpretação do Composer. Nós da mesma dimensão são agrupados num
 * único nó — a topologia é a mensagem, não o detalhe.
 *   - operação principal (core);
 *   - processos operacionais confirmados (satellite) — 1 nó por dimensão,
 *     label = dimensão curta; SEM setas inventadas;
 *   - métricas NUNCA viram elo operacional (ficam fora do mapa);
 *   - tecnologia confirmada → 1 nó warning "Tecnologia" (agrupada).
 * Quando houver relação estruturada no SafePack (same_root /
 * direct_pj_relation), ela pode gerar aresta — nunca a ausência dela.
 */
function buildChaosMap(safePack: SafeFindingPack, segment: ScoutSegment = 'industrial_geral'): string | null {
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

  // BRU-119 P1 A': agrupar processos por dimensão — 1 nó satellite por
  // dimensão distinta, label = dimensão curta. Claim integral fica só na
  // tabela de elos (evidence-first) e na leitura do Composer.
  // Quando o claim não casa em nenhum padrão do segmento, o fallback de
  // valueChainDimension devolve claim cru (slice 0,60) — o mapa troca
  // por label genérico ("Processo") para manter topology-first.
  const dimIdx = new Map<string, number>();
  let bIdx = 1;
  for (const fact of operationFacts.slice(0, 6)) {
    const dimension = valueChainDimension(fact.claim, fact.kind, segment);
    const isFallback = dimension === fact.claim.slice(0, 60);
    const label = isFallback ? 'Processo' : dimension;
    const key = label.toLowerCase().trim();
    if (!dimIdx.has(key)) {
      dimIdx.set(key, bIdx++);
      const id = nodeId('B', dimIdx.get(key)!);
      lines.push(`${id}[${quotedLabel(label)}]`);
      classes.push(`class ${id} satellite;`);
    }
  }

  // Tecnologia confirmada — 1 único nó warning "Tecnologia" (agrupada).
  const techFacts = facts.filter((f) => f.kind === 'technology');
  if (techFacts.length > 0) {
    const techId = nodeId('C', 1);
    lines.push(`${techId}[${quotedLabel('Tecnologia')}]`);
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
    // BRU-108 (1b): `D -- Sim ==> E` é sintaxe inválida no Mermaid 10.9.6
    // (mistura `--` com `==>` — parse error "got 'STR'"). A forma canônica de
    // aresta grossa com rótulo é `== texto ==>`.
    // BRU-119 follow-up (P0 visual, Preview 488728d5): o fix do BRU-108
    // escreveu `D ==> Sim ==> E` — que NÃO é aresta rotulada: o parser trata
    // "Sim" e "E" como nós e o source vaza para o render. Formas corretas
    // abaixo (`D == Sim ==> E`), com o nó E definido com label humano.
    'D == Sim ==> E["Definir sponsor e owner"]',
    'E ==> F["Dimensionar impacto"]',
    'F ==> G["Movimento comercial"]',
    'D == Não ==> H["Nutrir ou encerrar hipótese"]',
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
  if (normalized.length <= max) return normalized;
  // BRU-108 (2): truncar em limite de palavra — o corte cru anterior produzia
  // "certificações BC..." (palavra partida) e "Existe um sistema e..." (sem
  // completar a ideia) na coluna Validar.
  const cut = normalized.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const boundary = lastSpace > max * 0.6 ? lastSpace : max - 1;
  return `${cut.slice(0, boundary).replace(/[\s,;:—–-]+$/, '')}...`;
}

function statusBadge(status: string): string {
  return status === 'Confirmado' ? '✅ Confirmado' : '🟠 A validar';
}

/**
 * BRU-119 follow-up (P0 semântico — Planejador, Preview 488728d5): a
 * observação "WMS não aparece no recorte" é um fato, mas colar ✅ Confirmado
 * na linha lê-se como "WMS confirmado" ou "ausência confirmada" — ausência
 * não é confirmação. Matcher ESTREITO (apenas os padrões de negação de
 * presença que o compact produz); qualquer outra evidência segue o status
 * do signal sem rebaixamento.
 */
const ABSENCE_EVIDENCE_PATTERN =
  /\bn[ãa]o\s+(?:aparece|aparecem|consta|constam|identificad[oa]s?|confirmad[oa]s?|localizad[oa]s?|encontrad[oa]s?)\b/i;

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
 * RCA-05: a normalização de discovery (e seu vocabulário protegido) vive na
 * fonte canônica gold-policy.ts — re-exportada aqui para compatibilidade.
 */
import { normalizeDiscoveryQuestion } from '../gold-policy';
export { normalizeDiscoveryQuestion };

/**
 * BRU-108 (3): a coluna Validar distribuía a MESMA pergunta para todas as
 * linhas da dimensão (validationForDimension usava find() → sempre a primeira
 * compatível; o run 2fe72ab3 repetiu "Qual é o volume..." em 4 linhas de
 * produção). Agora cada pergunta compatível é consumida uma única vez; quando
 * esgota, a linha fica sem pergunta ("—") em vez de duplicar.
 */
function validationForDimension(
  openQuestions: string[],
  dimension: string,
  usedQuestions: Set<string>,
): string {
  const dimensionTokens = dimension.toLowerCase().split(/\s+e\s+|\s+/);
  const compatible = openQuestions.filter((question) => {
    const questionLower = question.toLowerCase();
    return dimensionTokens.some((token) => token.length > 4 && questionLower.includes(token));
  });
  const available = compatible.find((question) => !usedQuestions.has(normalizeDiscoveryQuestion(question)));
  if (!available) return '—';
  const normalized = normalizeDiscoveryQuestion(available);
  usedQuestions.add(normalized);
  return truncateCell(normalized, 140);
}

export function buildDynamicValueChainTable(
  safePack: SafeFindingPack,
  segment: ScoutSegment = 'industrial_geral',
): string | null {
  const rows: ValueChainRow[] = [];
  const openQuestions = safePack.openQuestions ?? [];
  // BRU-108 (3): pool de perguntas já consumidas pela coluna Validar —
  // impede a mesma pergunta em múltiplas linhas da dimensão.
  const usedQuestions = new Set<string>();

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
      validate: validationForDimension(openQuestions, dimension, usedQuestions),
    });
  }

  for (const signal of safePack.technologySignals ?? []) {
    const dimension = valueChainDimension(signal.technology, 'technology', segment);
    const normalizedSignalQuestion = normalizeDiscoveryQuestion(signal.validationQuestion);
    usedQuestions.add(normalizedSignalQuestion);
    rows.push({
      elo: valueChainElo(dimension),
      dimension: signal.technology,
      status: ABSENCE_EVIDENCE_PATTERN.test(signal.observedFact) ? '🟠 A validar' : statusBadge(signal.status),
      evidence: signal.observedFact.replace(/\|/g, '/'),
      validate: truncateCell(normalizedSignalQuestion, 140),
    });
  }

  for (const question of openQuestions) {
    const normalizedQuestion = normalizeDiscoveryQuestion(question);
    if (usedQuestions.has(normalizedQuestion)) continue;
    if (rows.some((row) => row.validate === normalizedQuestion)) continue;
    usedQuestions.add(normalizedQuestion);
    rows.push({
      elo: 'discovery',
      dimension: 'Discovery',
      status: '🟠 A validar',
      evidence: 'Pergunta aberta do dossiê',
      validate: truncateCell(normalizedQuestion, 140),
    });
  }

  if (rows.length === 0) return null;

  // BRU-119 C — Dedupe narrow: mesma dimensão/elo + evidência normalizada = remove;
  // evidências distintas na mesma dimensão permanecem. Sem agregador/heurística nova.
  const deduped: ValueChainRow[] = [];
  const seenKeys = new Set<string>();
  for (const row of rows) {
    const key = `${row.dimension.toLowerCase().trim()}|${row.evidence.toLowerCase().trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(row);
    }
  }
  rows.length = 0;
  rows.push(...deduped);

  const order = SEGMENT_VALUE_CHAIN[segment].map((entry) => entry.label.toLowerCase());
  rows.sort((a, b) => {
    const aIndex = order.findIndex((label) => a.dimension.toLowerCase().includes(label));
    const bIndex = order.findIndex((label) => b.dimension.toLowerCase().includes(label));
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  });

  // BRU-119 follow-up (P2, Planejador — Preview 488728d5): a coluna
  // "Leitura comercial" era template fixo por classe de linha ("Base
  // confirmada para entender o elo de...") — zero informação por linha,
  // só boilerplate repetido. Removida.
  const tableRows = rows.map((row) => `| ${row.elo} | ${row.dimension} | ${row.status} | ${row.evidence} | ${row.validate} |`);
  return [
    '### 🔗 MAPA DE ELOS DA CADEIA DE VALOR',
    '',
    '| Elo | Dimensão | Status | Evidência | Validar |',
    '| --- | --- | --- | --- | --- |',
    ...tableRows,
  ].join('\n');
}

/**
 * ARCH-C (BRU-112) — Artifact Contract.
 *
 * O builder determinístico devolve o markdown FINAL + um manifest de
 * METADADOS (sem conteúdo do Gold): quais componentes eram esperados, quais
 * foram emitidos, mermaid por tipo/quantidade, tabela de elos, e o motivo
 * determinístico de N/A. Componente esperado ausente = FAIL no artifact
 * contract (validado no seam).
 *
 * NÃO é regra cega "sempre 3 mermaid": a expectativa respeita pré-condições
 * (ex.: Mapa do Caos N/A sem fatos suficientes; tabela de elos N/A sem
 * conteúdo de cadeia).
 */
export interface GoldArtifactManifest {
  /** Headings de seção-alvo encontrados no markdown final. */
  targetSectionsFound: string[];
  /** Componentes esperados dado o SafePack (com motivo determinístico de N/A). */
  componentsExpected: Array<{
    id: 'chaos-map' | 'teia-map' | 'sales-path' | 'value-chain-table';
    expected: boolean;
    reason?: 'safe-pack-insufficient' | 'canonical-required';
  }>;
  /** Componentes efetivamente emitidos. */
  componentsEmitted: Array<'chaos-map' | 'teia-map' | 'sales-path' | 'value-chain-table'>;
  /** Blocos Mermaid por tipo (contagem no markdown final). */
  mermaidByType: Record<string, number>;
  valueChainTableEmitted: boolean;
}

export interface GoldArtifact {
  markdown: string;
  manifest: GoldArtifactManifest;
}

const ARTIFACT_SECTION_HEADING = /^###\s*\d+\.\s*([^\n]+)$/gm;

function countMermaidByType(markdown: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const blocks = markdown.match(/```mermaid\n?([\s\S]*?)```/g) ?? [];
  for (const block of blocks) {
    const firstLine = block.split('\n')[0] ?? '';
    const key = firstLine.replace(/```mermaid/, 'mermaid').trim() || 'mermaid';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * ARCH-C (BRU-112): constrói o artifact (markdown + manifest) a partir do
 * SafePack. `injectCanonicalGoldMermaids` mantém compatibilidade devolvendo
 * `artifact.markdown`; o seam usa `buildGoldArtifact` para o artifact contract.
 */
export function buildGoldArtifact(
  goldBrief: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
  segment: ScoutSegment = 'industrial_geral',
): GoldArtifact {
  // 1) Remove todos os blocos Mermaid existentes.
  let gold = goldBrief.replace(/```mermaid\n?[\s\S]*?```\n?/gi, '');

  // 2) Mapa do Caos + Elos na seção 2 (PERFIL).
  const chaos = buildChaosMap(safePack, segment);
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

  const targetSectionsFound = [...gold.matchAll(ARTIFACT_SECTION_HEADING)].map((m) => m[1]?.trim() ?? '');
  const componentsEmitted: GoldArtifactManifest['componentsEmitted'] = [];
  if (chaos) componentsEmitted.push('chaos-map');
  if (teia) componentsEmitted.push('teia-map');
  componentsEmitted.push('sales-path');
  if (valueChainTable) componentsEmitted.push('value-chain-table');

  const componentsExpected: GoldArtifactManifest['componentsExpected'] = [
    {
      id: 'chaos-map',
      expected: confirmedFacts(safePack).filter((f) => f.kind === 'operation').length >= 2,
      reason: confirmedFacts(safePack).filter((f) => f.kind === 'operation').length < 2 ? 'safe-pack-insufficient' : undefined,
    },
    { id: 'teia-map', expected: true },
    { id: 'sales-path', expected: true },
    {
      id: 'value-chain-table',
      expected: (safePack.facts ?? []).some((f) => f.status === 'Confirmado'),
      reason: !(safePack.facts ?? []).some((f) => f.status === 'Confirmado') ? 'safe-pack-insufficient' : undefined,
    },
  ];

  const manifest: GoldArtifactManifest = {
    targetSectionsFound,
    componentsExpected,
    componentsEmitted,
    mermaidByType: countMermaidByType(gold),
    valueChainTableEmitted: Boolean(valueChainTable),
  };

  return { markdown: gold, manifest };
}

/**
 * Insere os mapas determinísticos no Gold:
 * 1. Remove QUALQUER bloco ```mermaid ... ``` existente (Mermaid livre do Composer);
 * 2. Injeta o Mapa do Caos e a tabela dinâmica na seção 2,
 *    a Teia Societária na seção 3 e o Caminho da Venda na seção 9.
 *
 * A inserção é feita logo após o heading da seção-alvo (### N. NOME).
 * ARCH-C (BRU-112): delega para buildGoldArtifact (markdown + manifest).
 */
export function injectCanonicalGoldMermaids(
  goldBrief: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
  segment: ScoutSegment = 'industrial_geral',
): string {
  return buildGoldArtifact(goldBrief, canonical, safePack, segment).markdown;
}
