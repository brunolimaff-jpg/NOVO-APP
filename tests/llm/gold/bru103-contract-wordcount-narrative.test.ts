import { describe, expect, it } from 'vitest';
import { validateGoldContract } from '../../../services/llm/gold/gold-contract-validator';

function lorem(n: number): string {
  const w = ['operação', 'agrícola', 'consolidada', 'cadeia', 'valor', 'safra', 'soja', 'algodão', 'cliente', 'Senior', 'ERP', 'módulo', 'logística', 'colheita', 'beneficiamento', 'exportação', 'contrato', 'frota', 'armazenagem', 'unidade', 'hectare', 'produção', 'mercado', 'regional', 'expansão', 'investimento', 'processo', 'equipe', 'sistema', 'dado', 'relatório', 'indicador', 'resultado', 'governança', 'decisão', 'plano'];
  const o = [];
  for (let i = 0; i < n; i++) o.push(w[i % w.length]);
  return o.join(' ');
}

const SECTIONS = ['1. SÍNTESE EXECUTIVA', '2. PERFIL', '3. ESTRUTURA SOCIETÁRIA', '4. TECNOLOGIA', '5. PESSOAS-CHAVE', '6. INDICADORES', '7. SINAIS', '8. RISCOS', '9. PRÓXIMOS PASSOS'];

const WORD_RE = /[a-zA-ZÀ-ÿ0-9]+(?:['’-][a-zA-ZÀ-ÿ0-9]+)*/g;

function buildNarrativeGold(): string {
  const parts: string[] = [];
  for (const s of SECTIONS) {
    parts.push(`### ${s}`);
    parts.push(
      s.includes('PRÓXIMOS')
        ? '**1.** Definir owner do projeto.\n**2.** Dimensionar impacto.\n**3.** Movimento comercial.'
        : lorem(120),
    );
  }
  return parts.join('\n\n');
}

function mermaidBlock(name: string, lines: string[], legend: string): string {
  return ['```mermaid', 'graph LR', ...lines, `class ${name} core;`, '```', '', `*Legenda: ${legend}*`].join('\n');
}

function elosTable(): string {
  return [
    '### 🔗 MAPA DE ELOS DA CADEIA DE VALOR',
    '',
    '| Elo | Dimensão | Status | Evidência | Leitura comercial | Validar |',
    '| --- | --- | --- | --- | --- | --- |',
    '| producao | Produção | ✅ Confirmado | Safra operacional confirmada | Base confirmada para entender o elo de produção | — |',
    '| armazenagem | Armazenagem | 🟠 A validar | Pergunta aberta do dossiê | Tema ainda não comprovado | Qual é o volume total de armazenagem? |',
  ].join('\n');
}

/** Componentes determinísticos pós-Composer (mesma estrutura do builder real). */
function deterministicBlocks(): string {
  return [
    mermaidBlock('A', ['A["Operação principal"]', 'B["Safra operacional confirmada"]'], 'azul (core) = operação principal confirmada.'),
    mermaidBlock('A', ['A["SCHEFFER & CIA LTDA — 04.733.767/0001-80"]', 'B["SCHEFFER PARTICIPACOES S/A — 11.021.773/0001-70"]', 'B ==> A'], 'azul (core) = entidade confirmada; verde (satellite) = relação direta confirmada.'),
    mermaidBlock('A', ['A["Evidência segura"] ==> B["Hipótese comercial"]'], 'azul (core) = etapa confirmada do caminho.'),
    elosTable(),
  ].join('\n\n');
}

function injectAfterSection(gold: string, sectionPattern: RegExp, block: string): string {
  return gold.replace(sectionPattern, (m) => `${m}\n\n${block}`);
}

const S2 = /^###\s*2\.\s*PERFIL[^\n]*$/mi;

function buildFinalGold(): string {
  return injectAfterSection(buildNarrativeGold(), S2, deterministicBlocks());
}

/**
 * BRU-103 (design congelado — Planejador 2026-08-14): 900–1500 é o orçamento
 * da NARRATIVA humana do Gold. O builder injeta pós-Composer os mapas Mermaid
 * e a tabela de elos — componentes determinísticos que inflam o texto final.
 * O validator continua rodando no artefato final, mas o wordCount exclui
 * SOMENTE esses blocos (a causa real do contract_fail do run d3ebe647:
 * wordCount=2321 medido sobre o Gold completo).
 */
describe('BRU-103 — wordCount sobre a NARRATIVA (exclui Mermaid + tabela de elos)', () => {
  it('RED→GREEN: artefato final (narrativa + blocos determinísticos) → wordCount narrativo dentro de 900–1500', () => {
    const finalGold = buildFinalGold();
    const rawWords = (finalGold.match(WORD_RE) || []).length;

    // Controlo do RED: medido cru, o artefato completo é MAIOR que a narrativa
    // (os blocos determinísticos realmente inflam o texto).
    expect(rawWords).toBeGreaterThan(validateGoldContract(buildNarrativeGold()).metrics.wordCount);

    const r = validateGoldContract(finalGold);
    expect(r.metrics.wordCount).toBeGreaterThanOrEqual(900);
    expect(r.metrics.wordCount).toBeLessThanOrEqual(1500);
    expect(r.metrics.wordCount).toBeLessThan(rawWords);
    expect(r.violations.map((v) => v.code)).not.toContain('WORD_COUNT_OUT_OF_RANGE');
  });

  it('paridade: blocos determinísticos somam ZERO ao wordCount (narrativa == artefato final)', () => {
    const narr = buildNarrativeGold();
    const full = buildFinalGold();
    expect(validateGoldContract(full).metrics.wordCount).toBe(validateGoldContract(narr).metrics.wordCount);
  });

  it('strip isolado: bloco Mermaid + legenda não entram no wordCount', () => {
    const narr = buildNarrativeGold();
    const blocks = mermaidBlock('A', ['A["Operação principal"]', 'B["Safra operacional confirmada"]'], 'azul (core) = operação principal confirmada.');
    const full = injectAfterSection(narr, S2, blocks);
    expect(validateGoldContract(full).metrics.wordCount).toBe(validateGoldContract(narr).metrics.wordCount);
  });

  it('strip isolado: tabela determinística de elos não entra no wordCount', () => {
    const narr = buildNarrativeGold();
    const full = injectAfterSection(narr, S2, elosTable());
    expect(validateGoldContract(full).metrics.wordCount).toBe(validateGoldContract(narr).metrics.wordCount);
  });

  it('tabela do Composer (não determinística) CONTINUA contando palavras', () => {
    const narr = buildNarrativeGold();
    const composerTable = '| Ano | Resultado |\n| --- | --- |\n| 2024 | Safra consolidada |\n| 2025 | Safra recorde |';
    const full = injectAfterSection(narr, S2, composerTable);
    const base = validateGoldContract(narr).metrics.wordCount;
    const withTable = validateGoldContract(full).metrics.wordCount;
    expect(withTable).toBeGreaterThan(base);
  });
});

describe('BRU-103 — assinatura estrutural das ações (sem regex cega)', () => {
  it('ações em bold numeradas → actionFormats { named: 0, tableRows: 0, numbered: 3 }', () => {
    const r = validateGoldContract(buildNarrativeGold());
    expect(r.metrics.actionFormats).toEqual({ named: 0, tableRows: 0, numbered: 3 });
    expect(r.violations.map((v) => v.code)).not.toContain('ACTION_COUNT_MISMATCH');
  });

  it('ações nomeadas → actionFormats reflete o formato real', () => {
    const parts: string[] = [];
    for (const s of SECTIONS) {
      parts.push(`### ${s}`);
      parts.push(
        s.includes('PRÓXIMOS')
          ? 'Ação 1: Definir owner do projeto.\nAção 2: Dimensionar impacto.\nAção 3: Movimento comercial.'
          : lorem(120),
      );
    }
    const gold = parts.join('\n\n');
    const r = validateGoldContract(gold);
    expect(r.metrics.actionFormats).toEqual({ named: 3, tableRows: 0, numbered: 0 });
  });
});
