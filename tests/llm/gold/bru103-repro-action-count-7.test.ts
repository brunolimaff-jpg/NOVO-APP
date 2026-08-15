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
 * BRU-103 (run 20573b42 — preview 819974d3, Scheffer): verifier 0/0/0/0,
 * wordCount=1265 (OK), mas ACTION_COUNT_MISMATCH com actionFormats.numbered=7.
 * Causa: o Composer descreve o fluxo conceitual do Caminho da Venda como lista
 * numerada ("1. Evidência → 2. Hipótese → ...") e o contador soma como ação.
 * Fix: linhas numeradas com seta (→) são FLUXO, não ação — removidas antes da
 * contagem (assinatura estrutural, sem regex cega); prompt orienta fluxo em
 * linha única com setas e movimentos como os únicos numerados da seção 9.
 */
describe('BRU-103 — fluxo conceitual numerado não conta como ação', () => {
  it('fluxo numerado com setas + 3 movimentos → actionCount 3 (sem ACTION_COUNT_MISMATCH)', () => {
    const acoes = [
      '### Caminho da Venda',
      '1. Evidência segura → 2. Hipótese comercial → 3. Discovery → 4. Decisão.',
      '',
      '### 3 movimentos recomendados',
      '5. Validar capacidade de armazenagem.',
      '6. Agenda de discovery com o CFO.',
      '7. Proposta piloto com prazo de 30 dias.',
    ].join('\n');
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionFormats.numbered).toBe(3);
    expect(r.metrics.actionCount).toBe(3);
    expect(r.violations.map((v) => v.code)).not.toContain('ACTION_COUNT_MISMATCH');
  });

  it('fluxo numerado com setas em bold + 3 movimentos → actionCount 3', () => {
    const acoes = [
      '### Caminho da Venda',
      '**1.** Evidência segura → **2.** Hipótese comercial → **3.** Discovery → **4.** Decisão.',
      '',
      '### 3 movimentos recomendados',
      '**1.** Validar capacidade de armazenagem.',
      '**2.** Agenda de discovery com o CFO.',
      '**3.** Proposta piloto com prazo de 30 dias.',
    ].join('\n');
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionFormats.numbered).toBe(3);
    expect(r.metrics.actionCount).toBe(3);
    expect(r.violations.map((v) => v.code)).not.toContain('ACTION_COUNT_MISMATCH');
  });

  it('guarda: 7 movimentos reais (sem seta) continuam ACTION_COUNT_MISMATCH', () => {
    const acoes = [
      '### 3 movimentos recomendados',
      '1. Validar capacidade de armazenagem.',
      '2. Agenda de discovery com o CFO.',
      '3. Proposta piloto com prazo de 30 dias.',
      '4. Definir owner do projeto.',
      '5. Dimensionar impacto.',
      '6. Visitar a unidade de Canarana.',
      '7. Reunião com o CFO.',
    ].join('\n');
    const r = validateGoldContract(buildGold(acoes));
    expect(r.metrics.actionFormats.numbered).toBe(7);
    expect(r.metrics.actionCount).toBe(7);
    expect(r.violations.map((v) => v.code)).toContain('ACTION_COUNT_MISMATCH');
  });
});
