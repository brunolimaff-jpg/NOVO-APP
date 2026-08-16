/**
 * BRU-118 — P1 scaffolding leak (fail-closed).
 *
 * Sanitizador/detector DETERMINÍSTICO e ESTREITO de scaffolding interno do
 * Gold. O Composer pode ecoar meta-rótulos/enums técnicos ensinados no prompt
 * (ex.: "(Conteúdo para o Builder)", "(Operações Confirmadas)" e enums de
 * relação `same_root`/`direct_pj_relation`/`partner_other_cnpj`). Regras:
 *
 * 1. Remove somente HEADINGS internos CONHECIDOS (padrão exato por linha);
 *    preserva todo o conteúdo abaixo (tabelas/fatos).
 * 2. Humaniza somente enums CONHECIDOS quando aparecem em papel/descrição,
 *    preservando a DIREÇÃO da relação (nunca "empresa do grupo" para lateral).
 * 3. É idempotente.
 * 4. Residual AMBÍGUO/desconhecido reprova FECHADO (scaffold_fail) — não é
 *    apagado silenciosamente. O seam usa `detectGoldScaffoldingResidual` no
 *    artefato FINAL EXATO para selecionar factual_minimal.
 *
 * NÃO é um julgamento genérico de "texto de prompt": a lista é estreita e
 * derivada dos padrões reais observados na validação manual do Bruno
 * (2026-08-15).
 */

/** Enums técnicos de relação que o Composer conhece pelo prompt (não podem
 * atravessar como texto). Humanização preserva direção. */
export const SCAFFOLD_ENUM_HUMANIZED: ReadonlyArray<{ readonly raw: string; readonly human: string }> = [
  { raw: 'same_root', human: 'mesma raiz' },
  { raw: 'direct_pj_relation', human: 'relação PJ direta' },
  { raw: 'partner_other_cnpj', human: 'relação lateral' },
];

/** Headings internos CONHECIDOS (linha inteira de heading com o meta-rótulo). */
const INTERNAL_HEADING_PATTERNS: ReadonlyArray<RegExp> = [
  /^#{1,6}\s*(?:Teia Societária|Mapa do Caos)[^\n]*\((?:Conteúdo para o Builder|Operações Confirmadas)\)/i,
  /^#{1,6}\s*[^\n]*\(Operações Confirmadas\)/i,
];

export interface ScaffoldingResidual {
  /** Motivo estruturado: heading interno conhecido ou enum técnico cru. */
  reason: 'internal_heading' | 'internal_enum';
  /** Identificador estável (telemetria estrutural). */
  code: 'SCAFFOLD_HEADING' | 'SCAFFOLD_ENUM';
  /** Trecho detectado — apenas o token/padrão, nunca o conteúdo completo do Gold. */
  snippet: string;
}

/** Detector puro: retorna os residuais de scaffolding encontrados no texto. */
export function detectGoldScaffoldingResidual(text: string): ScaffoldingResidual[] {
  const residuals: ScaffoldingResidual[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    for (const pattern of INTERNAL_HEADING_PATTERNS) {
      if (pattern.test(line)) {
        residuals.push({
          reason: 'internal_heading',
          code: 'SCAFFOLD_HEADING',
          // apenas a primeira parte da linha (até o token interno), sem conteúdo sensível
          snippet: line.slice(0, 80),
        });
        break;
      }
    }
    for (const { raw } of SCAFFOLD_ENUM_HUMANIZED) {
      // Usa fronteira de palavra para não casar dentro de outro identificador.
      const re = new RegExp(`\\b${raw}\\b`);
      if (re.test(line)) {
        residuals.push({ reason: 'internal_enum', code: 'SCAFFOLD_ENUM', snippet: raw });
      }
    }
  }
  return residuals;
}

/** Humanizar enums em uma linha, preservando a direção da relação. */
function humanizeEnumsInLine(line: string): string {
  let humanized = line;
  for (const { raw, human } of SCAFFOLD_ENUM_HUMANIZED) {
    const re = new RegExp(`\\b${raw}\\b`, 'g');
    humanized = humanized.replace(re, human);
  }
  return humanized;
}

export interface ScaffoldingSanitizeResult {
  text: string;
  removed: {
    scaffoldHeadings: number;
    humanizedEnums: number;
  };
}

/**
 * Aplica o sanitizador ESTREITO. Remove headings internos conhecidos (linha
 * inteira) e humaniza enums conhecidos. Não apaga conteúdo abaixo do heading e
 * não reescreve texto genérico. Se um padrão ambíguo/desconhecido indicar
 * scaffolding residual, ele PERMANECE no texto — quem decide o fail-closed é o
 * gate de residual (seam), que seleciona factual_minimal por scaffold_fail.
 */
export function sanitizeGoldScaffolding(text: string): ScaffoldingSanitizeResult {
  const lines = text.split('\n');
  const out: string[] = [];
  let scaffoldHeadings = 0;
  let humanizedEnums = 0;

  for (const line of lines) {
    const isInternalHeading = INTERNAL_HEADING_PATTERNS.some((pattern) => pattern.test(line));
    if (isInternalHeading) {
      scaffoldHeadings += 1;
      continue; // remove só a linha do heading; conteúdo abaixo permanece
    }
    const humanized = humanizeEnumsInLine(line);
    if (humanized !== line) humanizedEnums += 1;
    out.push(humanized);
  }

  return {
    // junta preservando as linhas vazias originais (sem colapsar parágrafos)
    text: out.join('\n').replace(/\n{3,}/g, '\n\n'),
    removed: { scaffoldHeadings, humanizedEnums },
  };
}