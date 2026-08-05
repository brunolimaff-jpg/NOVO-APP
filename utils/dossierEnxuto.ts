// utils/dossierEnxuto.ts
// Pós-processamento do dossiê final para o modo executivo enxuto (padrão).
//
// Regras (decisão Bruno 2026-08-04 + plano dossiê enxuto):
// 1. Máximo 1 bloco mermaid por dossiê — mantém o primeiro válido e remove
//    os demais (o contrato v3 pede tabela/bullets no lugar).
// 2. Headers "DOSSIÊ SCOUT 360" repetidos (2º em diante) são rebaixados para
//    H2 — o primeiro H1 continua sendo o módulo principal; os demais viram
//    seções, reduzindo a repetição de títulos de dossiê.
// 3. Linhas idênticas repetidas (conteúdo literal duplicado, ex: CNPJ em
//    bullets repetidos) mantêm só a primeira ocorrência.

const MERMAID_FENCE = /```mermaid[\s\S]*?```/gi;
const DOSSIER_HEADER_PREFIX = /dos(?:s)?i[eê] scout 360/i;

export interface DossierEnxutoResult {
  text: string;
  removedMermaidBlocks: number;
  demotedHeaders: number;
  removedDuplicateLines: number;
}

/**
 * Mantém apenas o primeiro bloco mermaid do texto; os demais são removidos.
 * Blocos JSON `{"mermaid":"..."}` também são contados e removidos (o primeiro
 * fenced block tem prioridade; JSON só entra se não houver fenced block).
 */
export function enforceMaxOneMermaid(text: string): { text: string; removed: number } {
  if (!text) return { text, removed: 0 };

  const fences = text.match(MERMAID_FENCE) || [];
  const jsonBlocks = text.match(/\{"mermaid":"([\s\S]*?)"\}/g) || [];

  if (fences.length <= 1 && jsonBlocks.length === 0) return { text, removed: 0 };

  let removed = 0;
  let keptFirstFence = false;

  const deduped = text
    .replace(MERMAID_FENCE, match => {
      if (!keptFirstFence) {
        keptFirstFence = true;
        return match;
      }
      removed += 1;
      return '';
    })
    .replace(/\{"mermaid":"([\s\S]*?)"\}/g, match => {
      if (keptFirstFence) {
        removed += 1;
        return '';
      }
      keptFirstFence = true;
      return match;
    });

  return { text: deduped.replace(/\n{3,}/g, '\n\n'), removed };
}

const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

/**
 * Rebaixa headers H1 que contêm "DOSSIÊ SCOUT 360" a partir da 2ª ocorrência
 * para H2 (##). A primeira ocorrência permanece H1 (módulo principal).
 */
export function demoteRepeatedDossierHeaders(text: string): { text: string; demoted: number } {
  if (!text) return { text, demoted: 0 };

  let seenDossierHeader = false;
  let demoted = 0;

  const result = text
    .split('\n')
    .map(line => {
      const match = line.match(HEADING_LINE);
      if (!match) return line;
      const level = match[1].length;
      if (level !== 1) return line;
      if (!DOSSIER_HEADER_PREFIX.test(match[2])) return line;
      if (!seenDossierHeader) {
        seenDossierHeader = true;
        return line;
      }
      demoted += 1;
      return `## ${match[2]}`;
    })
    .join('\n');

  return { text: result, demoted };
}

/**
 * Remove linhas de conteúdo idênticas repetidas (ex: bullets com o mesmo
 * CNPJ/valor aparecendo mais de uma vez no dossiê). Mantém a primeira
 * ocorrência.
 *
 * Linhas estruturais são preservadas: vazias, separadores (`---`), headers
 * (`# ...`) e linhas de tabela (`| ...`) — essas repetem legitimamente.
 * Exige conteúdo >= 24 chars para não remover frases curtas comuns.
 */
export function removeDuplicateLines(text: string): { text: string; removed: number } {
  if (!text) return { text, removed: 0 };

  const seen = new Set<string>();
  let removed = 0;

  const result = text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^(#{1,6})\s/.test(trimmed)) return line;
      if (/^\|/.test(trimmed)) return line;
      if (/^[-*_]{3,}$/.test(trimmed)) return line;
      if (trimmed.length < 24) return line;
      if (seen.has(trimmed)) {
        removed += 1;
        return '';
      }
      seen.add(trimmed);
      return line;
    })
    .join('\n');

  return { text: result.replace(/\n{3,}/g, '\n\n'), removed };
}

/**
 * Aplica todas as regras do dossiê enxuto em ordem:
 * 1. Limita a 1 bloco mermaid;
 * 2. Rebaixa headers "DOSSIÊ SCOUT 360" repetidos;
 * 3. Remove linhas duplicadas.
 */
export function applyDossierEnxuto(text: string): DossierEnxutoResult {
  const mermaid = enforceMaxOneMermaid(text);
  const headers = demoteRepeatedDossierHeaders(mermaid.text);
  const lines = removeDuplicateLines(headers.text);

  return {
    text: lines.text,
    removedMermaidBlocks: mermaid.removed,
    demotedHeaders: headers.demoted,
    removedDuplicateLines: lines.removed,
  };
}
