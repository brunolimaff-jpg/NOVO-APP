/**
 * BRU-117 lote 2 — Precondição do Golden Live discriminante e PII-safe.
 *
 * RED: a falha antiga colapsava todas as condições numa mensagem genérica
 * ("Greeting ausente e nome do operador são obrigatórios") e lia "Greeting
 * ausente" como causa, quando greetingCount === 0 é a condição ESPERADA de
 * sucesso.
 *
 * GREEN: cada predicado faltante é distinguível (flags estruturais) e o erro
 * NÃO carrega email/nome real/token/storage.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateGoldenOperatorPreconditions,
  formatGoldenPreconditionFailure,
  missingGoldenPreconditionFlags,
  type GoldenOperatorPreconditionObservation,
} from '../../utils/goldenPrecondition';

const OK: GoldenOperatorPreconditionObservation = {
  sessionReady: true,
  shellReady: true,
  headerReady: true,
  menuReady: true,
  greetingCount: 0,
  operatorNameReady: true,
};

describe('BRU-117 lote 2 — precondição Golden discriminante', () => {
  it('GREEN: greetingCount === 0 é PASS (Greeting ausente = condição esperada)', () => {
    const report = evaluateGoldenOperatorPreconditions(OK);
    expect(report.passed).toBe(true);
    expect(report.greetingAbsent).toBe(true);
  });

  it('RED→GREEN: cada predicado faltante é distinguível (sessionReady)', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, sessionReady: false });
    expect(report.passed).toBe(false);
    expect(missingGoldenPreconditionFlags(report)).toEqual(['sessionReady']);
  });

  it('RED→GREEN: shellReady faltante é distinguível', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, shellReady: false });
    expect(missingGoldenPreconditionFlags(report)).toEqual(['shellReady']);
  });

  it('RED→GREEN: headerReady faltante é distinguível', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, headerReady: false });
    expect(missingGoldenPreconditionFlags(report)).toEqual(['headerReady']);
  });

  it('RED→GREEN: menuReady faltante é distinguível', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, menuReady: false });
    expect(missingGoldenPreconditionFlags(report)).toEqual(['menuReady']);
  });

  it('RED→GREEN: greeting presente (count > 0) é distinto de Greeting ausente', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, greetingCount: 1 });
    expect(report.greetingAbsent).toBe(false);
    expect(missingGoldenPreconditionFlags(report)).toEqual(['greetingAbsent']);
  });

  it('RED→GREEN: operatorNameReady faltante é distinguível', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, operatorNameReady: false });
    expect(missingGoldenPreconditionFlags(report)).toEqual(['operatorNameReady']);
  });

  it('PII-safe: a mensagem de falha só carrega nomes de flags, nunca email/nome/token', () => {
    const report = evaluateGoldenOperatorPreconditions({ ...OK, sessionReady: false, operatorNameReady: false });
    const message = formatGoldenPreconditionFailure(report);
    expect(message).toContain('sessionReady');
    expect(message).toContain('operatorNameReady');
    expect(message).not.toContain('qa.e2e@senior.com.br');
    expect(message).not.toContain('@');
    expect(message).not.toContain('access_token');
    expect(message).not.toContain('localStorage');
  });

  it('GREEN: múltiplos predicados faltantes aparecem todos', () => {
    const report = evaluateGoldenOperatorPreconditions({
      ...OK,
      shellReady: false,
      headerReady: false,
      greetingCount: 3,
    });
    expect(missingGoldenPreconditionFlags(report)).toEqual(['shellReady', 'headerReady', 'greetingAbsent']);
  });
});
