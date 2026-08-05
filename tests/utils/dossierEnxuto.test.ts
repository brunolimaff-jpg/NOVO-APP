import { describe, it, expect } from 'vitest';
import {
  applyDossierEnxuto,
  demoteRepeatedDossierHeaders,
  enforceMaxOneMermaid,
  removeDuplicateLines,
} from '../../utils/dossierEnxuto';

describe('enforceMaxOneMermaid', () => {
  it('keeps text untouched when there is at most one mermaid block', () => {
    const text = '# Titulo\n\n```mermaid\ngraph LR\nA-->B\n```\n\nFim.';
    const result = enforceMaxOneMermaid(text);
    expect(result.text).toBe(text);
    expect(result.removed).toBe(0);
  });

  it('removes extra mermaid fenced blocks, keeping only the first', () => {
    const text = [
      'Secao 1',
      '```mermaid',
      'graph LR',
      'A-->B',
      '```',
      'Secao 2',
      '```mermaid',
      'graph TD',
      'C-->D',
      '```',
      'Secao 3',
      '```mermaid',
      'graph LR',
      'E-->F',
      '```',
    ].join('\n');

    const result = enforceMaxOneMermaid(text);
    expect(result.removed).toBe(2);
    expect((result.text.match(/```mermaid/g) || []).length).toBe(1);
    expect(result.text).toContain('A-->B');
    expect(result.text).not.toContain('C-->D');
    expect(result.text).not.toContain('E-->F');
    expect(result.text).toContain('Secao 1');
    expect(result.text).toContain('Secao 3');
  });

  it('removes JSON mermaid payloads when a fenced block already exists', () => {
    const text = '```mermaid\ngraph LR\nA-->B\n```\n\n{"mermaid":"graph TD\\nC-->D"}\n\nFim.';
    const result = enforceMaxOneMermaid(text);
    expect(result.removed).toBe(1);
    expect(result.text).toContain('A-->B');
    expect(result.text).not.toContain('C-->D');
    expect(result.text).toContain('Fim.');
  });
});

describe('demoteRepeatedDossierHeaders', () => {
  it('demotes the second "DOSSIÊ SCOUT 360" H1 to H2, keeping the first', () => {
    const text = [
      '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL — GRUPO X',
      'Conteudo A',
      '# 🦅 DOSSIÊ SCOUT 360: BORDAS DE CONTROLE — GRUPO X',
      'Conteudo B',
    ].join('\n');

    const result = demoteRepeatedDossierHeaders(text);
    expect(result.demoted).toBe(1);
    expect(result.text).toContain('# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL');
    expect(result.text).toContain('## 🦅 DOSSIÊ SCOUT 360: BORDAS DE CONTROLE');
    expect(result.text.split('\n').filter(line => line.startsWith('# '))).toEqual([
      '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL — GRUPO X',
    ]);
  });

  it('does not touch H2+ headers or non-dossier headers', () => {
    const text = [
      '## 🦅 DOSSIÊ SCOUT 360: SECAO ANINHADA',
      '# TEIA SOCIETARIA: VISAO GERAL',
      '# 🎯 CAMINHO DE VENDA: GRUPO X',
    ].join('\n');

    const result = demoteRepeatedDossierHeaders(text);
    expect(result.demoted).toBe(0);
    expect(result.text).toBe(text);
  });
});

describe('removeDuplicateLines', () => {
  it('removes repeated content lines, keeping the first occurrence', () => {
    const text = [
      '- **CNPJ:** 04.733.767/0001-80 — matriz do grupo',
      'Conteudo unico',
      '- **CNPJ:** 04.733.767/0001-80 — matriz do grupo',
    ].join('\n');

    const result = removeDuplicateLines(text);
    expect(result.removed).toBe(1);
    expect((result.text.match(/- \*\*CNPJ:\*\* 04\.733\.767/g) || []).length).toBe(1);
  });

  it('preserves separators, headers, table rows and short lines', () => {
    const text = [
      '# Titulo',
      '',
      '---',
      '| Col A | Col B |',
      '| 1 | 2 |',
      '| 1 | 2 |',
      '---',
      'OK',
    ].join('\n');

    const result = removeDuplicateLines(text);
    expect(result.removed).toBe(0);
    expect(result.text).toContain('---');
    expect(result.text).toContain('| 1 | 2 |');
  });
});

describe('applyDossierEnxuto', () => {
  it('applies all rules in order and reports counters', () => {
    const text = [
      '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL',
      '```mermaid',
      'graph LR',
      'A-->B',
      '```',
      '- **CNPJ:** 04.733.767/0001-80 — matriz do grupo',
      '# 🦅 DOSSIÊ SCOUT 360: BORDAS DE CONTROLE',
      '```mermaid',
      'graph TD',
      'C-->D',
      '```',
      '- **CNPJ:** 04.733.767/0001-80 — matriz do grupo',
    ].join('\n');

    const result = applyDossierEnxuto(text);
    expect(result.removedMermaidBlocks).toBe(1);
    expect(result.demotedHeaders).toBe(1);
    expect(result.removedDuplicateLines).toBe(1);
    expect((result.text.match(/```mermaid/g) || []).length).toBe(1);
    expect(result.text).toContain('## 🦅 DOSSIÊ SCOUT 360: BORDAS DE CONTROLE');
    expect((result.text.match(/- \*\*CNPJ:\*\* 04\.733\.767/g) || []).length).toBe(1);
  });
});
