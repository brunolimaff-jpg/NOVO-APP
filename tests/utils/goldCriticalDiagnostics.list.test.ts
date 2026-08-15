import { describe, it, expect } from 'vitest';
import { GOLD_CRITICAL_DIAGNOSTIC_EVENTS, isGoldCriticalDiagnosticEvent } from '../../utils/goldCriticalDiagnostics';

/**
 * RCA-07 (BRU-101): observabilidade mínima do fallback pós-verifier.
 * output-selected (kind/reason de estado) e contract-done (passed) precisam
 * ter persistência GARANTIDA — sem eles, um run com verifier=0 que cai em
 * factual fica com o motivo do fallback NÃO VERIFICÁVEL (FALLBACK_REASON
 * NOT_PROVEN no run db950dd5). Ambos são estruturais (sem texto/claim).
 */
describe('RCA-07 — eventos críticos do fallback pós-verifier', () => {
  it('RED: output-selected é evento crítico (persistência garantida)', () => {
    expect(isGoldCriticalDiagnosticEvent('GoldSeam', 'output-selected')).toBe(true);
  });
  it('RED: contract-done é evento crítico (persistência garantida)', () => {
    expect(isGoldCriticalDiagnosticEvent('GoldSeam', 'contract-done')).toBe(true);
  });
  it('os eventos de fronteira existentes continuam críticos (não-regressão)', () => {
    for (const e of ['verifier-summary', 'diagnostics-pre-compose', 'diagnostics-post-preflight', 'diagnostics-post-mermaid', 'diagnostics-post-certainty']) {
      expect(isGoldCriticalDiagnosticEvent('GoldSeam', e)).toBe(true);
    }
    // BRU-109 (A): +compact-start/response/error + raw-schema-fail
    expect(GOLD_CRITICAL_DIAGNOSTIC_EVENTS.size).toBe(11);
  });
  it('evento fora da lista NÃO é crítico (sem vazar sampling)', () => {
    expect(isGoldCriticalDiagnosticEvent('GoldSeam', 'gold-start')).toBe(false);
    expect(isGoldCriticalDiagnosticEvent('OutraArea', 'output-selected')).toBe(false);
  });
});
