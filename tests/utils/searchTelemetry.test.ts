// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { initSearchTelemetry, trackSearchCall, getSearchTelemetrySnapshot } from '../../utils/searchTelemetry';

describe('searchTelemetry', () => {
  it('snapshot retorna vazio quando nenhuma store ativa', () => {
    const snap = getSearchTelemetrySnapshot();
    expect(snap.total).toBe(0);
    expect(snap.gemini.count).toBe(0);
    expect(snap.duckduckgo.count).toBe(0);
    expect(snap.ddgCallShare).toBe(0);
  });

  it('trackSearchCall é noop seguro quando store ausente', () => {
    expect(() =>
      trackSearchCall({
        provider: 'gemini',
        query: 'test',
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();
  });

  it('registra chamadas e snapshots corretamente', () => {
    initSearchTelemetry();

    trackSearchCall({ provider: 'gemini', query: 'cnpj scheffer', success: true, durationMs: 100, timestamp: 't1' });
    trackSearchCall({ provider: 'gemini', query: 'scheffer agro', success: false, durationMs: 50, timestamp: 't2' });
    trackSearchCall({ provider: 'duckduckgo', query: 'scheffer', success: true, durationMs: 200, timestamp: 't3' });

    const snap = getSearchTelemetrySnapshot();
    expect(snap.total).toBe(3);
    expect(snap.gemini.count).toBe(2);
    expect(snap.gemini.success).toBe(1);
    expect(snap.duckduckgo.count).toBe(1);
    expect(snap.duckduckgo.success).toBe(1);
    expect(snap.ddgCallShare).toBeCloseTo(1 / 3);
  });

  it('ring buffer limita a MAX entries', () => {
    initSearchTelemetry();

    for (let i = 0; i < 250; i++) {
      trackSearchCall({ provider: 'gemini', query: `q${i}`, success: true, durationMs: 10, timestamp: '' });
    }
    expect(getSearchTelemetrySnapshot().total).toBe(200);
  });
});
