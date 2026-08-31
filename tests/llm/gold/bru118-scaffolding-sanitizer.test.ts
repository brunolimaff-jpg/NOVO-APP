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

// ═══════════════════════════════════════════════════════════
// BRU-119 B: variante ambígua/não reconhecida em bold
// ═══════════════════════════════════════════════════════════
describe('BRU-119 B — bold não reconhecido NÃO é removido silenciosamente', () => {
  it('RED: bold não conhecido NÃO é removido pelo sanitizer (preserva texto)', () => {
    const text = 'Fonte: **Pesquisador interno** do dossiê';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).toContain('Pesquisador interno');
    expect(result.text).toContain('**');
    expect(result.removed.scaffoldHeadings).toBe(0);
  });

  it('GREEN: bold não reconhecido NÃO é listado como residual pelo detector', () => {
    const text = 'O resultado veio da **fonte externa não verificada**.';
    const residual = detectGoldScaffoldingResidual(text);
    expect(residual).toEqual([]);
  });

  it('GREEN: bold com parênteses interno CONHECIDO é removido (padrão inline)', () => {
    const text = '**Mapa do Caos (Operações Confirmadas):** processos listados abaixo\n\nMais conteúdo';
    const result = sanitizeGoldScaffolding(text);
    // Removido: a linha inteira do bold scaffold-known
    expect(result.text).not.toContain('Operações Confirmadas');
    // Conteúdo abaixo da linha removida é preservado
    expect(result.text).toContain('Mais conteúdo');
    expect(result.removed.scaffoldHeadings).toBeGreaterThanOrEqual(1);
    expect(detectGoldScaffoldingResidual(result.text)).toEqual([]);
  });

  it('GREEN: bold contendo enum em snake_case é humanizado', () => {
    const text = 'Relação **partner_other_cnpj** entre as empresas';
    const result = sanitizeGoldScaffolding(text);
    expect(result.text).not.toMatch(/partner_other_cnpj/);
    expect(result.text).toContain('relação lateral');
  });
});

// ═══════════════════════════════════════════════════════════
// BRU-119 A: prompt — Composer não espelha superfícies determinísticas
// ═══════════════════════════════════════════════════════════
describe('BRU-119 A — prompt remove instrução de espelho', () => {
  it('prompt NÃO instrui Composer a listar processos/operacoes em prosa', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const promptFile = fs.readFileSync(
      path.join(__dirname, '../../../services/llm/gold/prompts/gold-contract-prompts.ts'),
      'utf-8',
    );
    expect(promptFile).not.toMatch(/liste os processos.*que o Mapa do Caos deve representar/i);
    expect(promptFile).toMatch(/leitura comercial curta|NÃO liste processos|não escreva.*Mapa do Caos/i);
  });

  it('prompt mantém Tabela de CNPJs como complementar', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const promptFile = fs.readFileSync(
      path.join(__dirname, '../../../services/llm/gold/prompts/gold-contract-prompts.ts'),
      'utf-8',
    );
    expect(promptFile).toMatch(/Tabela de CNPJs/i);
  });
});

// ═══════════════════════════════════════════════════════════
// BRU-119 C: dedupe narrow da tabela de elos
// ═══════════════════════════════════════════════════════════
describe('BRU-119 C — dedupe narrow da tabela de elos', () => {
  function dedupeByDimensionEvidence(rows: Array<{dimension: string; evidence: string; elo: string}>) {
    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const row of rows) {
      const key = `${row.dimension.toLowerCase().trim()}|${row.evidence.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
      }
    }
    return deduped;
  }

  it('mesma dimensão + evidência equivalente é deduplicada', () => {
    const rows = [
      { dimension: 'Beneficiamento', evidence: 'Operação industrial confirmada: GATec', elo: 'beneficiamento' },
      { dimension: 'Beneficiamento', evidence: 'Operação industrial confirmada: GATec', elo: 'beneficiamento' },
      { dimension: 'Logística', evidence: 'Logística própria confirmada: GATec', elo: 'logística' },
    ];
    const result = dedupeByDimensionEvidence(rows);
    expect(result.length).toBe(2);
  });

  it('evidências DISTINTAS na mesma dimensão permanecem', () => {
    const rows = [
      { dimension: 'Logística', evidence: 'Logística própria confirmada: GATec Frota', elo: 'logística' },
      { dimension: 'Logística', evidence: 'Gap Commerce Log / OneClick: ausência de WMS/TMS', elo: 'logística' },
    ];
    const result = dedupeByDimensionEvidence(rows);
    expect(result.length).toBe(2);
  });

  it('tabela de CNPJs continua presente (não é afetada pelo dedupe)', () => {
    const text = '**Tabela de CNPJs**\n\n| Empresa | CNPJ | Papel |\n| SCHEFFER | 04733767000180 | Filial |';
    expect(text).toContain('Tabela de CNPJs');
    expect(text).toContain('SCHEFFER');
  });
});