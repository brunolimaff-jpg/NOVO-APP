import { describe, it, expect } from 'vitest';
import {
  detectGoldScaffoldingResidual,
  sanitizeGoldScaffolding,
} from '../../../services/llm/gold/gold-scaffolding-sanitizer';

/**
 * BRU-118 — P1 scaffolding leak (fail-closed).
 *
 * REDs discriminantes (rodam no baseline e FALHAM porque o detector/sanitizador
 * ainda não existe); após o GREEN, passam.
 *
 * Segmentação:
 * - headings/meta-rótulos internos do prompt do Composer (ex.: "(Conteúdo para
 *   o Builder)") e enums técnicos de relação (same_root/direct_pj_relation/
 *   partner_other_cnpj) NUNCA podem aparecer no Gold entregue;
 * - o sanitizador remove somente padrões conhecidos (estreito), preservando
 *   fatos/tabelas abaixo do heading;
 * - humanização de enum preserva a DIREÇÃO da relação;
 * - sanitizador idempotente;
 * - residual ambíguo/desconhecido reprova fechado.
 */

describe('BRU-118 — detector de residual de scaffolding Gold', () => {
  it('RED: heading interno "(Conteúdo para o Builder)" é detectado como residual', () => {
    const text = '### 3. ESTRUTURA SOCIETÁRIA 🏛️\n\n### Teia Societária (Conteúdo para o Builder)\n\n| Empresa | CNPJ | Papel |\n| SCHEFFER | 04.733.767/0001-80 | alvo |';
    const residual = detectGoldScaffoldingResidual(text);
    expect(residual.some((r) => r.reason === 'internal_heading')).toBe(true);
  });

  it('RED: meta-heading "(Operações Confirmadas)" é detectado como residual', () => {
    const text = '### Mapa do Caos (Operações Confirmadas)\n\n- processo confirmado A';
    const residual = detectGoldScaffoldingResidual(text);
    expect(residual.some((r) => r.reason === 'internal_heading')).toBe(true);
  });

  it('RED: enums crus de relação são detectados como residual', () => {
    const text = 'A SCHEFFER PARTICIPACOES é relação lateral (partner_other_cnpj) da conta.';
    const residual = detectGoldScaffoldingResidual(text);
    expect(residual.some((r) => r.reason === 'internal_enum')).toBe(true);
  });

  it('RED: outro enum (same_root / direct_pj_relation) também é detectado', () => {
    const text = 'same_root entre SCHEFFER e a holding; direct_pj_relation com a operação.';
    const residual = detectGoldScaffoldingResidual(text);
    expect(residual.some((r) => r.reason === 'internal_enum')).toBe(true);
  });

  it('GREEN: texto comercial legítimo NÃO dispara residual', () => {
    const text = 'A SCHEFFER & CIA LTDA opera cultivo próprio de soja no Mato Grosso.';
    expect(detectGoldScaffoldingResidual(text)).toEqual([]);
  });
});

describe('BRU-118 — sanitizador determinístico (GREEN)', () => {
  it('remove heading interno preservando o conteúdo abaixo (tabela/fatos)', () => {
    const text =
      '### 3. ESTRUTURA SOCIETÁRIA 🏛️\n\n### Teia Societária (Conteúdo para o Builder)\n\n| Empresa | CNPJ | Papel |\n| SCHEFFER | 04.733.767/0001-80 | alvo |';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).not.toContain('Conteúdo para o Builder');
    expect(result.text).toContain('| SCHEFFER | 04.733.767/0001-80 | alvo |');
    expect(result.removed.scaffoldHeadings).toBeGreaterThanOrEqual(1);
    expect(detectGoldScaffoldingResidual(result.text)).toEqual([]);
  });

  it('humaniza enum técnico preservando a direção da relação', () => {
    const text = 'A SCHEFFER PARTICIPACOES tem relação lateral (partner_other_cnpj) com a conta.';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).not.toMatch(/partner_other_cnpj/);
    expect(result.text).toContain('relação lateral');
    expect(detectGoldScaffoldingResidual(result.text)).toEqual([]);
  });

  it('humaniza same_root/direct_pj_relation em linguagem humana', () => {
    const text = 'same_root entre a matriz e a operação; direct_pj_relation com a PJ direta.';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).not.toMatch(/same_root/);
    expect(result.text).not.toMatch(/direct_pj_relation/);
    expect(detectGoldScaffoldingResidual(result.text)).toEqual([]);
  });

  it('sanitizador é idempotente (segunda passada não altera)', () => {
    const text =
      '### Teia Societária (Conteúdo para o Builder)\n\nRelação lateral (partner_other_cnpj) mantida.\n\nTabela: | Empresa | CNPJ |\n| SCHEFFER | 04.733.767/0001-80 |';
    const once = sanitizeGoldScaffolding(text).text;
    const twice = sanitizeGoldScaffolding(once).text;
    expect(twice).toBe(once);
  });

  it('texto legítimo passa sem alteração', () => {
    const text = '### 9. PRÓXIMOS PASSOS 🧭\n\nA operação agrícola é verticalizada.';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).toBe(text);
    expect(result.removed.scaffoldHeadings).toBe(0);
  });
});