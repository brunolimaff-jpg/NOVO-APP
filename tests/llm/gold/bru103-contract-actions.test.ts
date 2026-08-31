import { describe, it, expect } from 'vitest';
import { validateGoldContract } from '../../../services/llm/gold/gold-contract-validator';

function lorem(n: number): string {
  const w = ['operação', 'agrícola', 'consolidada', 'cadeia', 'valor', 'safra', 'soja', 'algodão', 'cliente', 'Senior', 'ERP', 'módulo', 'logística', 'colheita', 'beneficiamento', 'exportação', 'contrato', 'frota', 'armazenagem', 'unidade', 'hectare', 'produção', 'mercado', 'regional', 'expansão', 'investimento', 'processo', 'equipe', 'sistema', 'dado', 'relatório', 'indicador', 'resultado', 'governança', 'decisão', 'plano'];
  const o = [];
  for (let i = 0; i < n; i++) o.push(w[i % w.length]);
  return o.join(' ');
}

const SECTIONS = ['1. SÍNTESE EXECUTIVA', '2. PERFIL', '3. ESTRUTURA SOCIETÁRIA', '4. TECNOLOGIA', '5. PESSOAS-CHAVE', '6. INDICADORES', '7. SINAIS', '8. RISCOS', '9. PRÓXIMOS PASSOS'];

function buildGold(acoes: string): string {
  const parts: string[] = [];
  for (const s of SECTIONS) {
    parts.push(`### ${s}`);
    if (s.includes('PRÓXIMOS')) parts.push(acoes);
    else parts.push(lorem(120));
  }
  return parts.join('\n\n');
}

/**
 * BRU-103 (RCA-07): o prompt do Composer orienta "negrito nos números-chave"
 * — as 3 ações numeradas podem sair como "**1.** ...". O oracle antigo não
 * contava bold (actionCount=1 → ACTION_COUNT_MISMATCH → contract_fail —
 * causa provável do run 1ccd90f0). Alinhar o oracle ao prompt.
 */
describe('BRU-103 — oracle: ações numeradas em markdown bold', () => {
  it('RED/GREEN: "**1.** **2.** **3.**" (bold) → actionCount = 3 (sem ACTION_COUNT_MISMATCH)', () => {
    const acoes = '**1.** Definir owner do projeto.\n**2.** Dimensionar impacto.\n**3.** Movimento comercial.';
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionCount).toBe(3);
    expect(r.violations.map((v) => v.code)).not.toContain('ACTION_COUNT_MISMATCH');
  });

  it('não-regressão: "1. <Maiúscula>" numerado simples continua 3', () => {
    const acoes = '1. Definir owner do projeto.\n2. Dimensionar impacto.\n3. Movimento comercial.';
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionCount).toBe(3);
  });

  it('não-regressão: "Ação 1/2/3:" nomeado continua 3', () => {
    const acoes = 'Ação 1: Definir owner do projeto.\nAção 2: Dimensionar impacto.\nAção 3: Movimento comercial.';
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionCount).toBe(3);
  });
});
