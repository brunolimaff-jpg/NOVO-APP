import { describe, expect, it } from 'vitest';
import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../../utils/loadingCuriosities';

describe('loadingCuriosities', () => {
  const statusLike = /^(buscando|consultando|cruzando|mapeando|analisando|gerando|montando|preparando|rastreando|desconstruindo|auditando|infiltrando|inovação|sabia|aguarde)\b/i;

  it('fallback com empresa mantém foco na conta alvo', () => {
    const lines = buildLoadingCuriositiesFallback('Coprosoja');
    expect(lines.some((line) => line.toLowerCase().includes('coprosoja'))).toBe(true);
    expect(lines.some((line) => line.toLowerCase().includes('senior sistemas'))).toBe(false);
    expect(lines.some((line) => /score porta/i.test(line))).toBe(true);
  });

  it('parseia resposta estruturada com foco em empresa/setor/região', () => {
    const raw = JSON.stringify({
      empresa: ['Coprosoja ampliou armazenagem em apuração.'],
      setor: ['Agro intensifica digitalização de operações de grãos.']
    });
    const lines = parseLoadingCuriosities(raw, 'Coprosoja');
    expect(lines[0]).toContain('Coprosoja');
    expect(lines.some((line) => line.toLowerCase().includes('agro'))).toBe(true);
  });

  it('quando JSON vem inválido, usa fallback robusto', () => {
    const lines = parseLoadingCuriosities('texto livre inválido', 'Grupo Scheffer');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.toLowerCase().includes('grupo scheffer'))).toBe(true);
    expect(lines.some((line) => statusLike.test(line))).toBe(true);
    expect(lines.some((line) => /score porta/i.test(line))).toBe(true);
  });

  it('filtra textos internos de prompt e protocolo do loading', () => {
    const raw = JSON.stringify({
      empresa: [
        'INVESTIGACAO_COMPLETA_INTEGRADA (MVP): Execute o dossie.',
        'Grupo Scheffer ampliou operação logística em MT.',
      ],
      senior: ['Protocolo de investigação forense especializada: conteúdo interno'],
      setor: ['O agro em MT segue com sinais de expansão em armazenagem.'],
    });
    const lines = parseLoadingCuriosities(raw, 'Grupo Scheffer');
    expect(lines.some((line) => line.includes('INVESTIGACAO_COMPLETA_INTEGRADA'))).toBe(false);
    expect(lines.some((line) => line.toLowerCase().includes('protocolo de investigação forense'))).toBe(false);
    expect(lines.some((line) => line.includes('Grupo Scheffer'))).toBe(true);
  });

  it('preserva linhas longas de processo com contexto da empresa e remove status genérico', () => {
    const raw = JSON.stringify({
      empresa: [
        'Cruzando Grupo Scheffer com benchmarks operacionais para identificar lacunas de gestão...',
        'Grupo Scheffer reforça controle logístico em MT para ganhar previsibilidade.'
      ],
      setor: ['Consultando inteligência interna...']
    });
    const lines = parseLoadingCuriosities(raw, 'Grupo Scheffer');
    expect(lines.some((line) => /cruzando grupo scheffer/i.test(line))).toBe(true);
    expect(lines.some((line) => /consultando inteligência interna/i.test(line))).toBe(false);
    expect(lines.some((line) => /grupo scheffer reforça controle logístico/i.test(line))).toBe(true);
  });

  it('descarta linhas que citam explicitamente outra empresa e preserva itens genéricos', () => {
    const raw = JSON.stringify([
      "Desconstruindo a teia societária da HART'S - ALIMENTOS NATURAIS LTDA para calibrar o Score PORTA contra o setor.",
      'Sabia? A tecnologia Senior orquestra os processos críticos de 1 em cada 4 grandes empresas do país.',
    ]);

    const lines = parseLoadingCuriosities(raw, 'Grupo Scheffer');

    expect(lines.some((line) => /hart/i.test(line))).toBe(false);
    expect(lines.some((line) => /senior/i.test(line))).toBe(true);
    expect(lines.some((line) => /grupo scheffer/i.test(line))).toBe(true);
  });

  it('cai para fallback da empresa atual quando todas as curiosidades estruturadas estão contaminadas', () => {
    const raw = JSON.stringify({
      empresa: [
        "Desconstruindo a teia societária da HART'S - ALIMENTOS NATURAIS LTDA para calibrar o Score PORTA contra o setor.",
        "Auditando o perímetro fiscal da HART'S - ALIMENTOS NATURAIS LTDA para detectar riscos e incentivos ocultos.",
      ],
    });

    const lines = parseLoadingCuriosities(raw, 'Grupo Scheffer');

    expect(lines.some((line) => /hart/i.test(line))).toBe(false);
    expect(lines.some((line) => /grupo scheffer/i.test(line))).toBe(true);
  });
});
