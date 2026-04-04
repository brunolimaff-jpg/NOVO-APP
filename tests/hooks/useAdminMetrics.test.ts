import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdminMetrics } from '../../hooks/useAdminMetrics';
import { ChatSession } from '../../types';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: `s-${Math.random()}`,
    title: 'Sessão Teste',
    empresaAlvo: 'Empresa A',
    cnpj: null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: 70,
    resumoDossie: null,
    createdAt: '2025-01-10T10:00:00.000Z',
    updatedAt: '2025-01-10T10:00:00.000Z',
    messages: [],
    ...overrides,
  };
}

describe('useAdminMetrics', () => {
  it('retorna métricas zeradas para lista vazia', () => {
    const { result } = renderHook(() => useAdminMetrics([]));
    expect(result.current.totalSessions).toBe(0);
    expect(result.current.totalCompanies).toBe(0);
    expect(result.current.avgScore).toBe(0);
    expect(result.current.topVendors).toHaveLength(0);
    expect(result.current.recentActivity).toHaveLength(0);
  });

  it('conta total de sessões corretamente', () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    expect(result.current.totalSessions).toBe(3);
  });

  it('conta empresas únicas (deduplicação por empresaAlvo)', () => {
    const sessions = [
      makeSession({ empresaAlvo: 'Fazenda Alpha' }),
      makeSession({ empresaAlvo: 'Fazenda Beta' }),
      makeSession({ empresaAlvo: 'Fazenda Alpha' }), // duplicada
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    expect(result.current.totalCompanies).toBe(2);
  });

  it('calcula score médio corretamente', () => {
    const sessions = [
      makeSession({ scoreOportunidade: 60 }),
      makeSession({ scoreOportunidade: 80 }),
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    expect(result.current.avgScore).toBe(70);
  });

  it('ignora sessões sem score no cálculo da média', () => {
    const sessions = [
      makeSession({ scoreOportunidade: 80 }),
      makeSession({ scoreOportunidade: null }),
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    expect(result.current.avgScore).toBe(80);
  });

  it('distribui scores nos buckets corretos', () => {
    const sessions = [
      makeSession({ scoreOportunidade: 10 }),
      makeSession({ scoreOportunidade: 35 }),
      makeSession({ scoreOportunidade: 55 }),
      makeSession({ scoreOportunidade: 75 }),
      makeSession({ scoreOportunidade: 90 }),
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    const dist = result.current.scoreDistribution;
    expect(dist.find(d => d.label === '0–20')?.count).toBe(1);
    expect(dist.find(d => d.label === '21–40')?.count).toBe(1);
    expect(dist.find(d => d.label === '41–60')?.count).toBe(1);
    expect(dist.find(d => d.label === '61–80')?.count).toBe(1);
    expect(dist.find(d => d.label === '81–100')?.count).toBe(1);
  });

  it('agrega atividade por data', () => {
    const sessions = [
      makeSession({ createdAt: '2025-01-10T10:00:00.000Z' }),
      makeSession({ createdAt: '2025-01-10T12:00:00.000Z' }),
      makeSession({ createdAt: '2025-01-11T09:00:00.000Z' }),
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    const jan10 = result.current.recentActivity.find(a => a.date === '2025-01-10');
    expect(jan10?.count).toBe(2);
  });

  it('normaliza modos antigos para investigacao no modeBreakdown', () => {
    const sessions = [
      makeSession({ modoPrincipal: 'operacao' }),
      makeSession({ modoPrincipal: 'operacao' }),
      makeSession({ modoPrincipal: 'diretoria' }),
    ];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    const investigacao = result.current.modeBreakdown.find(m => m.mode === 'investigacao');
    expect(investigacao?.count).toBe(3);
  });

  it('usa investigacao para sessões sem modoPrincipal', () => {
    const sessions = [makeSession({ modoPrincipal: null })];
    const { result } = renderHook(() => useAdminMetrics(sessions));
    const investigacao = result.current.modeBreakdown.find(m => m.mode === 'investigacao');
    expect(investigacao?.count).toBe(1);
  });

  it('limita topVendors a no máximo 10', () => {
    const sessions = Array.from({ length: 15 }, (_, i) =>
      makeSession({ empresaAlvo: `Empresa ${i}` }),
    );
    const { result } = renderHook(() => useAdminMetrics(sessions));
    expect(result.current.topVendors.length).toBeLessThanOrEqual(10);
  });
});
