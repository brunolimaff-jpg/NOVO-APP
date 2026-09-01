import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLongTaskObserverSupported, startLongTaskObserver } from '../../utils/longTaskObserver';
import { scoutDiag } from '../../utils/diagnosticLog';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  (globalThis as Record<string, unknown>).window = originalWindow;
});

type FakeEntry = { duration: number; startTime: number };
type FakeObserverInstance = { callback: (list: { getEntries: () => FakeEntry[] }) => void; disconnected: boolean };

function stubPerformanceObserverSupported(entriesTypes: string[]): FakeObserverInstance[] {
  const instances: FakeObserverInstance[] = [];
  class FakePO {
    static supportedEntryTypes: string[] = entriesTypes;
    callback: FakeObserverInstance['callback'];
    disconnected = false;
    constructor(cb: FakeObserverInstance['callback']) {
      this.callback = cb;
      instances.push(this);
    }
    observe(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
  }
  vi.stubGlobal('PerformanceObserver', FakePO);
  return instances;
}

function stubPerformanceObserverNotSupported(): void {
  class FakePO {
    static supportedEntryTypes: string[] = ['other'];
    callback: unknown;
    constructor() {}
    observe(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('PerformanceObserver', FakePO);
}

function emitLongTask(observer: FakeObserverInstance, durationMs: number, startTime = 0): void {
  if (observer.disconnected) return;
  observer.callback({
    getEntries: () => [{ duration: durationMs, startTime }],
  });
}

describe('longTaskObserver (BRU-162)', () => {
  it('isLongTaskObserverSupported: true quando PerformanceObserver suporta longtask', () => {
    stubPerformanceObserverSupported(['longtask', 'paint']);
    expect(isLongTaskObserverSupported()).toBe(true);
  });

  it('isLongTaskObserverSupported: false quando não suporta longtask', () => {
    stubPerformanceObserverNotSupported();
    expect(isLongTaskObserverSupported()).toBe(false);
  });

  it('isLongTaskObserverSupported: false quando PerformanceObserver não existe', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(isLongTaskObserverSupported()).toBe(false);
  });

  it('startLongTaskObserver: emite scoutDiag.warn com duração >= threshold, com fase corrente', () => {
    stubPerformanceObserverSupported(['longtask']);
    const warnSpy = vi.spyOn(scoutDiag, 'warn').mockImplementation(() => undefined);

    const observers = stubPerformanceObserverSupported(['longtask']);
    const handle = startLongTaskObserver('waterfall');
    expect(handle).not.toBeNull();
    if (!handle) return;

    expect(observers.length).toBe(1);
    emitLongTask(observers[0], 250, 1000);

    expect(warnSpy).toHaveBeenCalledWith('LongTask', 'long_task', expect.objectContaining({ phase: 'waterfall', durationMs: 250 }));

    handle.setPhase('finalize');
    emitLongTask(observers[0], 500, 2000);
    expect(warnSpy).toHaveBeenLastCalledWith('LongTask', 'long_task', expect.objectContaining({ phase: 'finalize', durationMs: 500 }));
  });

  it('startLongTaskObserver: ignora long task abaixo do threshold (100ms)', () => {
    const observers = stubPerformanceObserverSupported(['longtask']);
    const warnSpy = vi.spyOn(scoutDiag, 'warn').mockImplementation(() => undefined);

    const handle = startLongTaskObserver('waterfall');
    if (!handle) return;

    emitLongTask(observers[0], 50, 0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('startLongTaskObserver: stop() desconecta e não emite mais', () => {
    const observers = stubPerformanceObserverSupported(['longtask']);
    const warnSpy = vi.spyOn(scoutDiag, 'warn').mockImplementation(() => undefined);

    const handle = startLongTaskObserver('waterfall');
    if (!handle) return;

    handle.stop();
    emitLongTask(observers[0], 300, 0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('startLongTaskObserver: retorna null quando não suportado', () => {
    stubPerformanceObserverNotSupported();
    expect(startLongTaskObserver('waterfall')).toBeNull();
  });
});
