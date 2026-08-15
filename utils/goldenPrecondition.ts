/**
 * BRU-117 lote 2 — Precondição do Golden Live discriminante e PII-safe.
 *
 * O erro `GOLDEN_OPERATOR_PRECONDITION_FAILED` colapsava TODAS as condições
 * numa mensagem genérica ("Greeting ausente e nome do operador são
 * obrigatórios"), impossibilitando saber qual predicado falhou. Além disso,
 * "Greeting ausente" foi lido como causa quando NA VERDADE é a condição
 * ESPERADA de sucesso (greetingCount === 0).
 *
 * Este módulo é PURO (sem Playwright, sem DOM, sem PII): observa apenas flags
 * estruturais e decide se a precondição passou. O E2E e os testes vitest usam
 * a MESMA definição — nada de email, nome real, token ou storage atravessa.
 */

export interface GoldenOperatorPreconditionObservation {
  sessionReady: boolean;
  shellReady: boolean;
  headerReady: boolean;
  menuReady: boolean;
  greetingCount: number;
  operatorNameReady: boolean;
}

export interface GoldenOperatorPreconditionReport {
  passed: boolean;
  sessionReady: boolean;
  shellReady: boolean;
  headerReady: boolean;
  menuReady: boolean;
  /** greetingCount === 0 é a condição ESPERADA de sucesso (Greeting ausente). */
  greetingAbsent: boolean;
  operatorNameReady: boolean;
}

export const GOLDEN_OPERATOR_PRECONDITION_FAILED = 'GOLDEN_OPERATOR_PRECONDITION_FAILED';

/**
 * Avalia a precondição do operador real. `greetingCount === 0` é PASS (o card
 * de greeting não deve existir após o onboarding). Retorna TODAS as flags para
 * o chamador expor exatamente qual predicado faltou — sem PII.
 */
export function evaluateGoldenOperatorPreconditions(
  observation: GoldenOperatorPreconditionObservation,
): GoldenOperatorPreconditionReport {
  const greetingAbsent = observation.greetingCount === 0;
  const passed =
    observation.sessionReady &&
    observation.shellReady &&
    observation.headerReady &&
    observation.menuReady &&
    greetingAbsent &&
    observation.operatorNameReady;

  return {
    passed,
    sessionReady: observation.sessionReady,
    shellReady: observation.shellReady,
    headerReady: observation.headerReady,
    menuReady: observation.menuReady,
    greetingAbsent,
    operatorNameReady: observation.operatorNameReady,
  };
}

/** Nomes das flags que falharam (para a mensagem de erro discriminante). */
export function missingGoldenPreconditionFlags(report: GoldenOperatorPreconditionReport): string[] {
  const missing: string[] = [];
  if (!report.sessionReady) missing.push('sessionReady');
  if (!report.shellReady) missing.push('shellReady');
  if (!report.headerReady) missing.push('headerReady');
  if (!report.menuReady) missing.push('menuReady');
  if (!report.greetingAbsent) missing.push('greetingAbsent');
  if (!report.operatorNameReady) missing.push('operatorNameReady');
  return missing;
}

/** Mensagem de falha PII-safe: somente nomes de flags estruturais. */
export function formatGoldenPreconditionFailure(report: GoldenOperatorPreconditionReport): string {
  const missing = missingGoldenPreconditionFlags(report);
  const detail = missing.length > 0 ? ` — faltou: ${missing.join(', ')}` : '';
  return `${GOLDEN_OPERATOR_PRECONDITION_FAILED}: precondições do operador não satisfeitas${detail}`;
}
