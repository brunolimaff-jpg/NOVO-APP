// tests/hooks/useRadar.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRadar } from '../../hooks/useRadar';
import type { RadarAlert } from '../../types';

// Mock IDB
vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
}));

// Mock radarService (no real HTTP calls)
vi.mock('../../services/radarService', async () => {
  const actual = await vi.importActual<typeof import('../../services/radarService')>('../../services/radarService');
  return {
    ...actual,
    fetchRadarAlerts: vi.fn(),
  };
});

import { fetchRadarAlerts } from '../../services/radarService';
import { get as idbGet, set as idbSet } from 'idb-keyval';

function makeAlert(id: string, read = false): RadarAlert {
  return {
    id,
    title: `Alert ${id}`,
    summary: 'Summary',
    sourceUrl: 'https://example.com',
    sourceName: 'Portal',
    relevance: 'alta',
    publishedAt: '2024-01-01',
    category: 'concorrentes',
    read,
    receivedAt: Date.now(),
  };
}

describe('useRadar', () => {
  beforeEach(() => {
    vi.mocked(idbGet).mockResolvedValue(undefined);
    vi.mocked(idbSet).mockResolvedValue(undefined);
    vi.mocked(fetchRadarAlerts).mockResolvedValue({
      alerts: [],
      metaInsight: null,
      partialFailures: [],
      categoryStats: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inicia com estado padrão (sem alertas)', async () => {
    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toEqual([]));
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.isScanning).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it('carrega alertas do IDB ao inicializar', async () => {
    const saved = [makeAlert('a1'), makeAlert('a2', true)];
    vi.mocked(idbGet).mockImplementation(async (key: string) => {
      if (key === 'scout360_radar_alerts') return saved;
      return undefined;
    });

    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAsRead marca alerta como lido', async () => {
    const saved = [makeAlert('x1'), makeAlert('x2')];
    vi.mocked(idbGet).mockImplementation(async (key: string) => {
      if (key === 'scout360_radar_alerts') return saved;
      return undefined;
    });

    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));

    act(() => {
      result.current.markAsRead('x1');
    });

    expect(result.current.alerts.find(a => a.id === 'x1')!.read).toBe(true);
    expect(result.current.alerts.find(a => a.id === 'x2')!.read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAllAsRead marca todos como lido', async () => {
    const saved = [makeAlert('y1'), makeAlert('y2'), makeAlert('y3')];
    vi.mocked(idbGet).mockImplementation(async (key: string) => {
      if (key === 'scout360_radar_alerts') return saved;
      return undefined;
    });

    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toHaveLength(3));

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.alerts.every(a => a.read)).toBe(true);
  });

  it('dismissAlert remove alerta da lista', async () => {
    const saved = [makeAlert('d1'), makeAlert('d2')];
    vi.mocked(idbGet).mockImplementation(async (key: string) => {
      if (key === 'scout360_radar_alerts') return saved;
      return undefined;
    });

    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));

    act(() => {
      result.current.dismissAlert('d1');
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].id).toBe('d2');
  });

  it('updateConfig atualiza parcialmente a configuração', async () => {
    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.config).toBeDefined());

    act(() => {
      result.current.updateConfig({ estados: ['MT', 'MS'] });
    });

    expect(result.current.config.estados).toEqual(['MT', 'MS']);
  });

  it('forceScan define lastError quando não está configurado', async () => {
    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.config).toBeDefined());

    // Default config.isConfigured = false
    await act(async () => {
      await result.current.forceScan();
    });

    expect(result.current.lastError).not.toBeNull();
    expect(result.current.lastError!.code).toBe('RADAR_BAD_REQUEST');
  });

  it('IDB indisponível não quebra o hook (graceful degradation)', async () => {
    vi.mocked(idbGet).mockRejectedValue(new Error('IDB unavailable'));

    const { result } = renderHook(() => useRadar());
    await waitFor(() => expect(result.current.alerts).toBeDefined());
    expect(result.current.alerts).toEqual([]);
  });
});
