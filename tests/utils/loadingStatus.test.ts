import { describe, expect, it } from 'vitest';
import {
  finalizeLoadingProgress,
  isPhaseTimelineStatus,
  normalizeLoadingStatus,
  statusKey,
  transitionLoadingProgress,
} from '../../utils/loadingStatus';

describe('loadingStatus', () => {
  it('normaliza status live de fase para trilha padronizada', () => {
    expect(normalizeLoadingStatus('Executando Fase 7: Psicologia & Storytelling...')).toBe('Fase 7: Storytelling');
    expect(statusKey('Fase 7: Storytelling')).toBe('fase_7');
    expect(isPhaseTimelineStatus('Fase 7: Storytelling')).toBe(true);
  });

  it('normaliza etapas canônicas', () => {
    expect(normalizeLoadingStatus('Entendendo sua necessidade...')).toBe('Entendendo sua necessidade...');
    expect(normalizeLoadingStatus('Consultando inteligência interna...')).toBe('Consultando inteligência interna...');
    expect(normalizeLoadingStatus('Montando resposta prática...')).toBe('Montando resposta prática...');
  });

  it('aceita frases antigas como alias e retorna o texto novo', () => {
    expect(normalizeLoadingStatus('Analisando complexidade do pedido...')).toBe('Entendendo sua necessidade...');
    expect(normalizeLoadingStatus('Deep Research ativado — varredura web iniciada...')).toBe('Sinais externos em análise...');
    expect(normalizeLoadingStatus('Mapeando benchmarks...')).toBe('Cruzando referências de mercado...');
    expect(normalizeLoadingStatus('Consultando bases de conhecimento...')).toBe('Consultando inteligência interna...');
    expect(normalizeLoadingStatus('Gerando resposta...')).toBe('Montando resposta prática...');
    expect(normalizeLoadingStatus('Gerando ganchos comerciais finais...')).toBe('Preparando próximos passos...');
  });

  it('mantém etapa dinâmica de histórico da empresa', () => {
    expect(normalizeLoadingStatus('Buscando histórico de coprosoja...')).toBe('Buscando histórico de coprosoja...');
  });

  it('bloqueia payload interno em status dinâmico de histórico', () => {
    const leaked = 'Buscando histórico de Dossiê completo de [BOM FUTURO]. Protocolo de investigação forense especializada...';
    expect(normalizeLoadingStatus(leaked)).toBe('Sinais externos em análise...');
  });

  it('gera a mesma chave para estágios equivalentes', () => {
    expect(statusKey('Buscando histórico de coprosoja...')).toBe('historico');
    expect(statusKey('Buscando histórico de grupo scheffer...')).toBe('historico');
    expect(statusKey('Gerando resposta...')).toBe('resposta');
    expect(statusKey('Montando resposta prática...')).toBe('resposta');
  });

  it('acumula etapa concluída ao transicionar de um estágio real para outro', () => {
    expect(
      transitionLoadingProgress(
        'Estruturando contexto da conta...',
        'Consultando modelo analítico...',
        [],
      ),
    ).toEqual({
      stage: 'Consultando modelo analítico...',
      completedStages: ['Estruturando contexto da conta...'],
    });
  });

  it('não adiciona placeholders genéricos ao histórico concluído', () => {
    expect(
      transitionLoadingProgress('Realizando pesquisa...', 'Estruturando contexto da conta...', []),
    ).toEqual({
      stage: 'Estruturando contexto da conta...',
      completedStages: [],
    });
  });

  it('deduplica estágios equivalentes pela statusKey', () => {
    expect(
      transitionLoadingProgress(
        'Gerando resposta...',
        'Montando resposta prática...',
        ['Estruturando contexto da conta...'],
      ),
    ).toEqual({
      stage: 'Montando resposta prática...',
      completedStages: ['Estruturando contexto da conta...'],
    });
  });

  it('finaliza corretamente o último estágio visível', () => {
    expect(
      finalizeLoadingProgress(
        'Preparando próximos passos...',
        ['Estruturando contexto da conta...', 'Montando resposta prática...'],
      ),
    ).toEqual({
      stage: '',
      completedStages: [
        'Estruturando contexto da conta...',
        'Montando resposta prática...',
        'Preparando próximos passos...',
      ],
    });
  });
});
