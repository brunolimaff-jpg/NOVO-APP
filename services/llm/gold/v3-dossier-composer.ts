/**
 * V3 — Compositor determinístico da saída final do dossiê (BRU-155).
 *
 * Oracle: EXECUTIVE_LEAN_DOSSIER_OUTPUT_CONTRACT_V3 (prompts/mega/builders.ts).
 * Converte a concatenação de módulos crus (narrativa) na estrutura final V3:
 *
 * 1. EXATAMENTE 8 seções na ordem canônica, sem duplicar conteúdo;
 * 2. máximo 1 diagrama mermaid por dossiê;
 * 3. CNPJ em tabela macro única (grupo, empresas, papel, fonte, confiança),
 *    reconciliada contra os fatos canônicos do mapa societário ANTES da
 *    publicação — narrativa que nega CNPJ canônico ou subestima o total é
 *    corrigida (não termina "com 2" quando o mapa tem 18);
 * 4. ausência degrada explicitamente ("Não encontrado"), sem inventar;
 * 5. fontes/proveniência (grounding) a montante são preservadas.
 *
 * Função PURA e injetável: sem LLM, sem HTTP, sem window/document. Todos os
 * testes rodam com REAL_PROVIDER_CALLS=0.
 */
import { formatCnpj } from '../../../utils/cnpj';
import { enforceMaxOneMermaid } from '../../../utils/dossierEnxuto';
import { parseTeiaText } from '../../../features/dossier/teiaTextParser';
import type { SocietaryCompanyInput } from '../../../features/dossier/societaryGraph.types';

export const DOSSIER_V3_SECTIONS = [
  'Resumo executivo',
  'CNPJ e grupo econômico',
  'Estrutura operacional e força de trabalho',
  'Tecnologia e sistemas',
  'Dores e sinais de compra',
  'Cliente Senior parecido',
  'Caminho da venda',
  'Perguntas de abordagem',
] as const;
export type DossierV3Section = (typeof DOSSIER_V3_SECTIONS)[number];

export interface DossierV3CanonicalFact {
  cnpj: string | null;
  legalName: string;
  confidence: 'strong' | 'medium' | 'weak';
  source: string;
  relationshipScope?: 'group_link' | 'partner_other_cnpj' | 'unconfirmed';
}

export interface DossierV3GroundingSource {
  title: string;
  url: string;
  verification?: 'grounding' | 'fallback';
}

export interface DossierV3ComposeInput {
  companyName: string;
  /** Concatenação dos módulos crus + benchmark (após strip de markers internos). */
  narrative: string;
  /** Fatos canônicos do mapa societário (tabela mestre/QSA/socio-search). */
  canonicalFacts: DossierV3CanonicalFact[];
  /** Fontes de grounding coletadas a montante (preservar proveniência). */
  groundingSources?: DossierV3GroundingSource[];
  /** Módulos que falharam nesta execução (consolidar ausência, não inventar). */
  missingModules?: string[];
  /** Contexto CRM/cliente Senior parecido (seção 6 só quando confiável). */
  seniorContext?: string;
}

export interface DossierV3Reconciliation {
  canonicalTotalCnpjs: number;
  narrativeCnpjTotalMismatch: boolean;
  contradictoryClaimsRemoved: number;
  consolidatedAbsences: string[];
  groundingPreservedCount: number;
}

export interface DossierV3ComposeResult {
  text: string;
  sections: DossierV3Section[];
  reconciliation: DossierV3Reconciliation;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizeForMatch(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function confidenceLabel(confidence: DossierV3CanonicalFact['confidence']): string {
  if (confidence === 'strong') return 'Alta';
  if (confidence === 'medium') return 'Média';
  return 'Baixa (inferência)';
}

/**
 * Extrai fatos canônicos da Tabela Mestre de CNPJs do módulo teia (reusa o
 * parser determinístico de `parseTeiaText`). CNPJs com dígito verificador
 * inválido são rejeitados pelo parser (não viram fato).
 */
export function canonicalFactsFromTeiaText(markdown: string): DossierV3CanonicalFact[] {
  const { companies } = parseTeiaText(markdown || '');
  const confidenceOf = (confidence: SocietaryCompanyInput['confidence']): DossierV3CanonicalFact['confidence'] => {
    if (confidence === 'official' || confidence === 'strong') return 'strong';
    if (confidence === 'medium') return 'medium';
    return 'weak';
  };
  return companies
    .filter(company => Boolean(company.name))
    .map(company => ({
      cnpj: company.cnpj ? formatCnpj(company.cnpj) : null,
      legalName: company.name,
      confidence: confidenceOf(company.confidence),
      source: company.sourceTitle || 'LLM — Tabela CNPJs',
      relationshipScope: company.relationshipScope ?? (company.rootContext ? 'group_link' : 'partner_other_cnpj'),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliação: fatos canônicos antes da publicação
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_CLAIM_PATTERN =
  /(?:total\s+de\s+cnpjs\s+(?:identificados\s+com\s+fonte|mapeados)|numer[oó]\s+de\s+cnpjs\s+ativos|apenas|somente)[^0-9]*(\d+)\s+cnpj/i;

const DENIAL_CLAIM_PATTERN =
  /(?:n[aã]o\s+(?:teve|foi|foi\s+poss[ií]vel|possui|tem|localizou|apresentou)\s+.{0,40}?(?:cnpj|documento)|cnpj\s+n[aã]o\s+confirmad|sem\s+cnpj\s+confirmad|n[aã]o\s+(?:possui|tem|possue)\s+cnpj)/i;

function reconcileNarrative(
  narrative: string,
  facts: DossierV3CanonicalFact[],
): { text: string; removedTotals: number; removedDenials: number } {
  if (!narrative) return { text: '', removedTotals: 0, removedDenials: 0 };

  const canonicalTotal = facts.filter(fact => fact.cnpj).length;
  let removedTotals = 0;
  let removedDenials = 0;

  const kept: string[] = [];
  for (const line of narrative.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(line);
      continue;
    }

    // 1) Claim de total que subestima o mapa canônico é contradição — remove.
    if (canonicalTotal > 0) {
      const totalMatch = trimmed.match(TOTAL_CLAIM_PATTERN);
      if (totalMatch && Number(totalMatch[1]) < canonicalTotal) {
        removedTotals += 1;
        continue;
      }
    }

    // 2) Sentença que nega CNPJ de um fato canônico é contradição — remove.
    if (facts.length > 0) {
      const normalizedLine = normalizeForMatch(trimmed);
      const mentionsCanonicalName = facts.some(fact => {
        const name = normalizeForMatch(fact.legalName);
        return name.length >= 5 && normalizedLine.includes(name);
      });
      if (mentionsCanonicalName && DENIAL_CLAIM_PATTERN.test(trimmed)) {
        removedDenials += 1;
        continue;
      }
    }

    kept.push(line);
  }

  return { text: kept.join('\n'), removedTotals, removedDenials };
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação da narrativa nas 8 seções V3
// ─────────────────────────────────────────────────────────────────────────────

interface V3SectionMatch {
  section: DossierV3Section;
  patterns: RegExp[];
}

// Ordem de prioridade: primeira seção cujo padrão casar vence.
const SECTION_MATCHERS: V3SectionMatch[] = [
  {
    section: 'CNPJ e grupo econômico',
    patterns: [/teia/i, /societari/i, /\bcnpj\b/i, /grupo/i, /holding/i, /matriz/i, /filial/i, /socio/i, /participac/i],
  },
  {
    section: 'Estrutura operacional e força de trabalho',
    patterns: [
      /operacional/i, /operacao/i, /unidade/i, /headcount/i, /for[çc]a de trabalho/i, /funcionar/i, /planta/i,
      /hectare/i, /safra/i, /cadeia de valor/i, /raio-?x/i, /\bradar\b/i, /log[ií]stica/i, /frota/i, /\brh\b/i,
      /\bsst\b/i, /gest[ãa]o de pessoas/i, /colaborador/i,
    ],
  },
  {
    section: 'Tecnologia e sistemas',
    patterns: [/tech/i, /\bstack\b/i, /bordas de controle/i, /\bti\b/i, /sistemas/i, /\berp\b/i, /\bwms\b/i, /\btms\b/i, /software/i, /automa/i, /digital/i],
  },
  {
    section: 'Caminho da venda',
    patterns: [
      /caminho de venda|caminho da venda/i, /\bvenda\b/i, /abordagem/i, /estrat[ée]gia de entrada/i,
      /alvo priorit[aá]rio/i, /\bwedge\b/i, /persona/i, /sinais de urg[êe]ncia/i, /pr[óo]ximo passo/i, /gatilho/i,
    ],
  },
  {
    section: 'Dores e sinais de compra',
    patterns: [/dor/i, /sinal de compra/i, /problema/i, /risco/i, /urg[êe]nci/i, /\bgap\b/i, /calcanhar/i, /desafio/i, /fric[çc][aã]o/i, /vazamento/i, /margem/i, /perda/i, /compliance/i],
  },
  {
    section: 'Cliente Senior parecido',
    patterns: [/benchmark/i, /cliente senior/i, /cliente simil/i, /cliente parecid/i, /mercado/i, /segmento/i],
  },
  {
    section: 'Perguntas de abordagem',
    patterns: [/pergunta/i, /\bquestion/i],
  },
];

function classifyHeading(heading: string): DossierV3Section | null {
  const normalized = normalizeForMatch(heading);
  for (const matcher of SECTION_MATCHERS) {
    if (matcher.patterns.some(pattern => pattern.test(normalized))) return matcher.section;
  }
  return null;
}

function classifyParagraph(paragraph: string): DossierV3Section | null {
  const normalized = normalizeForMatch(paragraph);
  for (const matcher of SECTION_MATCHERS) {
    if (matcher.patterns.some(pattern => pattern.test(normalized))) return matcher.section;
  }
  return null;
}

interface NarrativeBlock {
  heading: string | null;
  lines: string[];
}

/** Separa a narrativa em blocos por heading markdown; remove headings que o composer reemite. */
function splitNarrativeBlocks(narrative: string): NarrativeBlock[] {
  const blocks: NarrativeBlock[] = [];
  let current: NarrativeBlock = { heading: null, lines: [] };
  const sectionHeadings = new Set(DOSSIER_V3_SECTIONS.map(section => normalizeForMatch(section)));

  for (const line of narrative.split('\n')) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const headingText = headingMatch[2].trim();
      // Heading que repete nome de seção V3: o composer reemite — não duplicar.
      if (sectionHeadings.has(normalizeForMatch(headingText))) continue;
      if (current.heading !== null || current.lines.length > 0) {
        blocks.push(current);
      }
      current = { heading: headingText, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.heading !== null || current.lines.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

function blockContent(block: NarrativeBlock): string {
  return block.lines
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^[-*_]{3,}$/.test(line))
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Construção das seções
// ─────────────────────────────────────────────────────────────────────────────

function buildResumoExecutivo(companyName: string, facts: DossierV3CanonicalFact[]): string {
  const confirmed = facts.filter(fact => fact.cnpj);
  const strong = confirmed.filter(fact => fact.confidence === 'strong');
  const sources = Array.from(new Set(confirmed.map(fact => fact.source).filter(Boolean)));
  const lines: string[] = [];

  if (companyName.trim()) {
    lines.push(`${companyName.trim()} — leitura executiva do dossiê.`);
  }
  if (confirmed.length > 0) {
    const sourceLabel = sources.length > 0 ? ` (fonte: ${sources.slice(0, 3).join(', ')})` : '';
    lines.push(`${confirmed.length} CNPJ(s) confirmado(s) no mapa societário${sourceLabel}.`);
  } else {
    lines.push('Não foram identificados CNPJs com fonte confirmada no recorte disponível.');
  }
  if (strong.length > 0) {
    lines.push(`${strong.length} relação(ões) confirmada(s): ${strong.slice(0, 3).map(fact => fact.legalName).join(', ')}.`);
  } else {
    lines.push('Sem relações societárias confirmadas no recorte — evidência insuficiente para afirmar grupo econômico.');
  }

  return lines.join('\n\n');
}

function buildCnpjMacroTable(facts: DossierV3CanonicalFact[]): string {
  const confirmed = facts.filter(fact => fact.cnpj);
  const unconfirmed = facts.filter(fact => !fact.cnpj);
  const roleLabel = (fact: DossierV3CanonicalFact): string => {
    if (fact.relationshipScope === 'group_link') return 'Grupo (mesmo raiz/controlada)';
    if (fact.relationshipScope === 'partner_other_cnpj') return 'Lateral (sócio em comum)';
    return 'A validar';
  };

  const lines: string[] = [
    '| CNPJ | Empresa | Papel na teia | Fonte | Confiança |',
    '|------|---------|---------------|------|-----------|',
  ];
  for (const fact of confirmed) {
    lines.push(`| ${fact.cnpj} | ${fact.legalName} | ${roleLabel(fact)} | ${fact.source} | ${confidenceLabel(fact.confidence)} |`);
  }
  lines.push('', `Total de CNPJs na tabela canônica: ${confirmed.length}.`);
  if (confirmed.length > 0) {
    lines.push('A tabela acima é o único lugar canônico dos CNPJs do grupo; demais menções são referências à mesma base.');
  }
  if (unconfirmed.length > 0) {
    lines.push('', `⚠️ ${unconfirmed.length} veículo(s) sem CNPJ confirmado (inferência, não fato):`);
    for (const fact of unconfirmed) {
      lines.push(`- ${fact.legalName} — ${fact.source} (${confidenceLabel(fact.confidence)})`);
    }
  }
  return lines.join('\n');
}

function buildGroundingBlock(sources: DossierV3GroundingSource[]): string {
  if (sources.length === 0) return '';
  const lines = ['', '**Fontes consultadas (proveniência):**'];
  for (const source of sources) {
    const label = source.title?.trim() || source.url;
    lines.push(`- [${label}](${source.url})`);
  }
  return lines.join('\n');
}

const MISSING_MODULE_TO_SECTION: Record<string, DossierV3Section> = {
  'Bordas de Controle': 'Tecnologia e sistemas',
  'Riscos & Compliance': 'Dores e sinais de compra',
  'Teia Societaria — Profundidade': 'CNPJ e grupo econômico',
  'Teia Societaria — Identidade': 'CNPJ e grupo econômico',
  'Benchmark de mercado': 'Cliente Senior parecido',
  'Caminho de Venda': 'Caminho da venda',
  'Operação / Cadeia de Valor': 'Estrutura operacional e força de trabalho',
  'porta-reconciliation': 'Dores e sinais de compra',
};

// ─────────────────────────────────────────────────────────────────────────────

export function composeDossierV3(input: DossierV3ComposeInput): DossierV3ComposeResult {
  const warnings: string[] = [];
  const facts = input.canonicalFacts ?? [];
  const groundingSources = input.groundingSources ?? [];
  const missingModules = input.missingModules ?? [];
  const companyName = input.companyName?.trim() || 'Empresa analisada';

  // 1) Reconciliação: remove contradições com o mapa canônico ANTES de publicar.
  const reconciled = reconcileNarrative(input.narrative || '', facts);
  if (reconciled.removedTotals > 0 || reconciled.removedDenials > 0) {
    warnings.push(
      `Reconciliação: ${reconciled.removedTotals} claim(s) de total e ${reconciled.removedDenials} negação(ões) contraditórias removidas.`,
    );
  }

  // 2) Distribui a narrativa reconciliada nas seções V3.
  const blocks = splitNarrativeBlocks(reconciled.text);
  const contentBySection = new Map<DossierV3Section, string[]>();
  for (const section of DOSSIER_V3_SECTIONS) contentBySection.set(section, []);

  for (const block of blocks) {
    const content = blockContent(block);
    if (!content) continue;
    const target = block.heading ? classifyHeading(block.heading) : null;
    if (target) {
      contentBySection.get(target)?.push(content);
      continue;
    }
    // Sem heading: classifica por parágrafo, ancorando no último padrão.
    for (const paragraph of content.split('\n')) {
      const section = classifyParagraph(paragraph);
      const targetSection = section ?? 'Dores e sinais de compra';
      contentBySection.get(targetSection)?.push(paragraph);
    }
  }

  // 3) Monta as seções na ordem canônica.
  const consolidatedAbsences: string[] = [];
  const sectionParts: string[] = [`# Dossiê executivo: ${companyName}`, ''];

  for (const section of DOSSIER_V3_SECTIONS) {
    sectionParts.push(`## ${section}`, '');

    if (section === 'Resumo executivo') {
      sectionParts.push(buildResumoExecutivo(companyName, facts));
    } else if (section === 'CNPJ e grupo econômico') {
      const table = buildCnpjMacroTable(facts);
      const content = contentBySection.get(section)?.join('\n\n') ?? '';
      const grounding = buildGroundingBlock(groundingSources);
      if (table || content) {
        sectionParts.push([table, content, grounding].filter(Boolean).join('\n\n'));
      } else {
        consolidatedAbsences.push(section);
        sectionParts.push('Não encontrado: não há CNPJs com fonte confirmada no mapa societário desta execução.');
      }
    } else if (section === 'Cliente Senior parecido') {
      const seniorContext = input.seniorContext?.trim();
      const content = contentBySection.get(section)?.join('\n\n') ?? '';
      if (seniorContext || content) {
        sectionParts.push([seniorContext, content].filter(Boolean).join('\n\n'));
      } else {
        consolidatedAbsences.push(section);
        sectionParts.push('Não identificado: sem contexto confiável de cliente Senior similar no recorte.');
      }
    } else {
      const content = contentBySection.get(section)?.join('\n\n') ?? '';
      if (content) {
        sectionParts.push(content);
      } else {
        consolidatedAbsences.push(section);
        const hasMissingModule = missingModules.some(moduleName => MISSING_MODULE_TO_SECTION[moduleName] === section);
        const reason = hasMissingModule
          ? 'módulo correspondente não produziu conteúdo nesta execução'
          : 'nada foi encontrado nas fontes disponíveis';
        sectionParts.push(`Não encontrado: ${reason}.`);
      }
    }
    sectionParts.push('');
  }

  // 4) Limita a 1 mermaid e normaliza.
  const assembled = sectionParts.join('\n');
  const { text } = enforceMaxOneMermaid(assembled);

  const canonicalTotalCnpjs = facts.filter(fact => fact.cnpj).length;

  return {
    text,
    sections: [...DOSSIER_V3_SECTIONS],
    reconciliation: {
      canonicalTotalCnpjs,
      narrativeCnpjTotalMismatch: reconciled.removedTotals > 0,
      contradictoryClaimsRemoved: reconciled.removedTotals + reconciled.removedDenials,
      consolidatedAbsences,
      groundingPreservedCount: groundingSources.length,
    },
    warnings,
  };
}
