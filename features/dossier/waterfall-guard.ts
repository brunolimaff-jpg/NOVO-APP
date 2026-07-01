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

export type WaterfallEndStatus = 'completed' | 'failed' | 'aborted' | 'partial';

export interface WaterfallGuardState {
  activeRunId: string | null;
  lastCompletedAt: number;
  lastEndStatus: WaterfallEndStatus | null;
  generationCount: number;
  blockedCount: number;
}

const guardBySession = new Map<string, WaterfallGuardState>();

let globalActiveRunId: string | null = null;
let globalLastCompletedAt = 0;

function getOrCreateGuard(sessionId: string): WaterfallGuardState {
  if (!guardBySession.has(sessionId)) {
    guardBySession.set(sessionId, {
      activeRunId: null,
      lastCompletedAt: 0,
      lastEndStatus: null,
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
  const now = Date.now();

  if (globalActiveRunId) {
    scoutDiag.warn('WaterfallGuard', 'floodgate: outro waterfall já está rodando (global)', {
      sessionId,
      globalActiveRunId,
      globalLastCompletedAt,
    });
    return { allowed: false, runId: globalActiveRunId, reason: 'already_running', guard: getOrCreateGuard(sessionId) };
  }

  const msSinceGlobalComplete = now - globalLastCompletedAt;
  if (globalLastCompletedAt > 0 && msSinceGlobalComplete < WATERFALL_COOLDOWN_MS) {
    scoutDiag.warn('WaterfallGuard', 'floodgate: cooldown global ainda ativo', {
      sessionId,
      msSinceGlobalComplete,
      cooldownMs: WATERFALL_COOLDOWN_MS,
    });
    return { allowed: false, runId: '', reason: 'cooldown', guard: getOrCreateGuard(sessionId) };
  }

  const guard = getOrCreateGuard(sessionId);
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
  globalActiveRunId = runId;

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
  status: WaterfallEndStatus,
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
  guard.lastEndStatus = status;
  globalActiveRunId = null;
  globalLastCompletedAt = Date.now();

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

export function isAnyWaterfallActive(): boolean {
  return globalActiveRunId !== null;
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
  globalActiveRunId = null;
  globalLastCompletedAt = 0;
}
