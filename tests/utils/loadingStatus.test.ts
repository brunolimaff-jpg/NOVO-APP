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
    expect(normalizeLoadingStatus('Avaliando profundidade da infraestrutura...')).toBe('Avaliando profundidade da infraestrutura...');
    expect(normalizeLoadingStatus('Consultando inteligência Senior...')).toBe('Consultando inteligência Senior...');
    expect(normalizeLoadingStatus('Materializando recomendações práticas...')).toBe('Materializando recomendações práticas...');
  });

  it('aceita frases antigas como alias e retorna o texto novo', () => {
    expect(normalizeLoadingStatus('Analisando complexidade do pedido...')).toBe('Avaliando profundidade da infraestrutura...');
    expect(normalizeLoadingStatus('Deep Research ativado — varredura web iniciada...')).toBe('Infiltrando em fontes externas e sinais digitais...');
    expect(normalizeLoadingStatus('Mapeando benchmarks...')).toBe('Auditando referências e contrapartidas de mercado...');
    expect(normalizeLoadingStatus('Consultando bases de conhecimento...')).toBe('Consultando inteligência Senior...');
    expect(normalizeLoadingStatus('Gerando resposta...')).toBe('Materializando recomendações práticas...');
    expect(normalizeLoadingStatus('Gerando ganchos comerciais finais...')).toBe('Preparando ganchos para fechamento...');
  });

  it('mantém etapa dinâmica de histórico da empresa', () => {
    expect(normalizeLoadingStatus('Buscando histórico de coprosoja...')).toBe('Buscando histórico de coprosoja...');
  });

  it('bloqueia payload interno em status dinâmico de histórico', () => {
    const leaked = 'Buscando histórico de Deep Dive de [BOM FUTURO]. Protocolo de investigação forense especializada...';
    expect(normalizeLoadingStatus(leaked)).toBe('Infiltrando em fontes externas e sinais digitais...');
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
        'Consolidando perímetro da conta alvo...',
        'Processando em motores de inferência tática...',
        [],
      ),
    ).toEqual({
      stage: 'Processando em motores de inferência tática...',
      completedStages: ['Consolidando perímetro da conta alvo...'],
    });
  });

  it('não adiciona placeholders genéricos ao histórico concluído', () => {
    expect(
      transitionLoadingProgress('Realizando pesquisa...', 'Consolidando perímetro da conta alvo...', []),
    ).toEqual({
      stage: 'Consolidando perímetro da conta alvo...',
      completedStages: [],
    });
  });

  it('deduplica estágios equivalentes pela statusKey', () => {
    expect(
      transitionLoadingProgress(
        'Gerando resposta...',
        'Materializando recomendações práticas...',
        ['Consolidando perímetro da conta alvo...'],
      ),
    ).toEqual({
      stage: 'Materializando recomendações práticas...',
      completedStages: ['Consolidando perímetro da conta alvo...'],
    });
  });

  it('finaliza corretamente o último estágio visível', () => {
    expect(
      finalizeLoadingProgress(
        'Preparando ganchos para fechamento...',
        ['Consolidando perímetro da conta alvo...', 'Materializando recomendações práticas...'],
      ),
    ).toEqual({
      stage: '',
      completedStages: [
        'Consolidando perímetro da conta alvo...',
        'Materializando recomendações práticas...',
        'Preparando ganchos para fechamento...',
      ],
    });
  });
});
