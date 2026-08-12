import { describe, it, expect } from 'vitest';
import { classifyChatIntent, type ChatIntent } from '../../utils/chatIntent';

/**
 * BRU-73 — testes unitários da função pura classifyChatIntent.
 *
 * Cobrem os 5 intents (craft, explicit, ambiguous, followup, scope-expansion)
 * e o guard de negação. Diferente dos testes de integração no orchestrator
 * (RED 5/7, que só verificam que o waterfall não foi chamado), estes provam
 * a classificação em si — o gap apontado na auditoria do Planejador.
 */
describe('BRU-73 — classifyChatIntent (função pura)', () => {
  const cases: Array<{ input: string; expected: ChatIntent }> = [
    // CRAFT_FROM_CONTEXT — criação comercial não inicia pesquisa.
    { input: 'Faça um email para o CFO sobre essa conta', expected: 'craft' },
    { input: 'Me dê um script de ligação para essa conta', expected: 'craft' },
    { input: 'Resuma esse dossiê', expected: 'craft' },
    { input: 'Preciso de uma proposta comercial', expected: 'craft' },

    // EXPLICIT — pesquisa com alvo claro ("sobre X", "o que/quem/como/...").
    { input: 'Pesquise mais sobre a holding', expected: 'explicit' },
    { input: 'pesquise sobre o que a empresa faz', expected: 'explicit' },
    { input: 'Quem são os sócios? pesquise', expected: 'craft' }, // "pesquise" sozinho no fim não tem alvo claro
    { input: 'Pesquise quem é o CEO', expected: 'explicit' },

    // AMBIGUOUS — pedido vago sem alvo ("pesquise mais", "aprofunde").
    { input: 'Pesquise mais', expected: 'ambiguous' },
    { input: 'Aprofunde', expected: 'ambiguous' },
    { input: 'aprofunde a análise', expected: 'ambiguous' },
    { input: 'descubra mais', expected: 'ambiguous' },

    // FOLLOWUP_NEXT_STEP — "aprofundar X agora" / pesquisa com próximo passo.
    { input: 'Aprofundar holding agora', expected: 'followup' },
    { input: 'pesquisar operação em seguida', expected: 'followup' },
    { input: 'investigar ERP na sequência', expected: 'followup' },

    // SCOPE_EXPANSION — "pesquise tudo" — ampliação material de escopo.
    { input: 'Pesquise tudo', expected: 'scope-expansion' },
    { input: 'pesquise todos os sócios', expected: 'scope-expansion' },
    { input: 'Pesquise completamente', expected: 'scope-expansion' },
  ];

  it.each(cases)('classifica "$input" como $expected', ({ input, expected }) => {
    expect(classifyChatIntent(input)).toBe(expected);
  });

  describe('guard de negação', () => {
    const negations = [
      'não pesquise mais sobre a holding',
      'não pesquise tudo',
      'pare de pesquisar a holding',
      'não aprofunde a análise',
      'não pesquise',
      'sem pesquisar a holding',
    ];
    it.each(negations)('negativa "$arg" nunca dispara pesquisa (craft)', (arg) => {
      const result = classifyChatIntent(arg);
      expect(result).toBe('craft');
    });
  });

  it('é determinística e case/acento-insensível', () => {
    expect(classifyChatIntent('PESQUISE MAIS SOBRE A HOLDING')).toBe('explicit');
    expect(classifyChatIntent('pesquise mais sobre a holding')).toBe('explicit');
    expect(classifyChatIntent('Aprofundar Holding Agora')).toBe('followup');
  });
});