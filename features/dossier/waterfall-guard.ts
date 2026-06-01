/**
 * WaterfallGuard — Trava anti-restart-loop para o waterfall de dossiê.
 *
 * Regras:
 * 1. Apenas 1 waterfall por sessão pode rodar simultaneamente
 * 2. Cooldown de WATERFALL_COOLDOWN_MS após conclusão antes de permitir nova execução
 * 3. Se floodgate bloquear, loga no Supabase via scoutDiag com razão detalhada
 *
 * O estado persiste em memória (module-level Map). Em caso de page reload,
 * o estado é resetado — o que é seguro porque o reload também reseta a UI.
 */

import { scoutDiag } from '../../utils/diagnosticLog';

export const WATERFALL_COOLDOWN_MS = 5_000;

export interface WaterfallGuardState {
  activeRunId: string | null;
  lastCompletedAt: number;
  generationCount: number;
  blockedCount: number;
}

const guardBySession = new Map<string, WaterfallGuardState>();

function getOrCreateGuard(sessionId: string): WaterfallGuardState {
  if (!guardBySession.has(sessionId)) {
    guardBySession.set(sessionId, {
      activeRunId: null,
      lastCompletedAt: 0,
      generationCount: 0,
      blockedCount: 0,
    });
  }
  return guardBySession.get(sessionId)!;
}

export interface WaterfallStartResult {
  allowed: boolean;
  runId: string;
  reason?: 'already_running' | 'cooldown' | 'max_restarts';
  guard: WaterfallGuardState;
}

/**
 * Tenta registrar o início de um waterfall.
 * Retorna { allowed: true, runId } se permitido, ou { allowed: false, reason } se bloqueado.
 */
export function registerWaterfallStart(sessionId: string): WaterfallStartResult {
  const guard = getOrCreateGuard(sessionId);
  const now = Date.now();

  if (guard.activeRunId) {
    guard.blockedCount++;
    scoutDiag.warn('WaterfallGuard', 'floodgate: waterfall já está rodando para esta sessão', {
      sessionId,
      activeRunId: guard.activeRunId,
      generationCount: guard.generationCount,
      blockedCount: guard.blockedCount,
    });
    return { allowed: false, runId: guard.activeRunId, reason: 'already_running', guard };
  }

  const msSinceLastComplete = now - guard.lastCompletedAt;
  if (guard.lastCompletedAt > 0 && msSinceLastComplete < WATERFALL_COOLDOWN_MS) {
    guard.blockedCount++;
    scoutDiag.warn('WaterfallGuard', 'floodgate: cooldown ainda ativo após conclusão anterior', {
      sessionId,
      msSinceLastComplete,
      cooldownMs: WATERFALL_COOLDOWN_MS,
      generationCount: guard.generationCount,
      blockedCount: guard.blockedCount,
    });
    return { allowed: false, runId: '', reason: 'cooldown', guard };
  }

  guard.generationCount++;
  const runId = `${sessionId}-gen${guard.generationCount}-${Date.now().toString(36)}`;
  guard.activeRunId = runId;

  scoutDiag.info('WaterfallGuard', 'waterfall:start', {
    sessionId,
    runId,
    generationCount: guard.generationCount,
    blockedCount: guard.blockedCount,
  });

  return { allowed: true, runId, guard };
}

/**
 * Registra a conclusão (sucesso ou falha) de um waterfall.
 */
export function registerWaterfallEnd(
  sessionId: string,
  runId: string,
  status: 'completed' | 'failed' | 'aborted',
): void {
  const guard = guardBySession.get(sessionId);
  if (!guard) return;

  if (guard.activeRunId !== runId) {
    scoutDiag.warn('WaterfallGuard', 'waterfall:end com runId divergente (possível restart)', {
      sessionId,
      expectedRunId: guard.activeRunId,
      receivedRunId: runId,
      status,
    });
    return;
  }

  guard.activeRunId = null;
  guard.lastCompletedAt = Date.now();

  scoutDiag.info('WaterfallGuard', 'waterfall:end', {
    sessionId,
    runId,
    status,
    generationCount: guard.generationCount,
    blockedCount: guard.blockedCount,
  });
}

/**
 * Retorna o estado atual do guard para uma sessão (apenas leitura).
 */
export function getWaterfallGuardState(sessionId: string): WaterfallGuardState | null {
  return guardBySession.get(sessionId) ?? null;
}

/**
 * Reseta o estado do guard para uma sessão específica ou todas as sessões.
 * USO EXCLUSIVO PARA TESTES. Não chamar em produção.
 */
export function resetWaterfallGuard(sessionId?: string): void {
  if (sessionId) {
    guardBySession.delete(sessionId);
  } else {
    guardBySession.clear();
  }
}
