import type { DossierRunContext } from '../../lib/supabase/dossierRuns';

/**
 * Registry de execução ativa do Dossier Flow.
 *
 * Persistido em sessionStorage para sobreviver a reload da aba (não a
 * fechamento/nova aba). O registro permite detectar, no boot, um run
 * persistido como ativo cujo contexto local de execução se perdeu
 * (RUN_PERSISTED_AS_ACTIVE + LOCAL_ACTIVE_RUN_CONTEXT_MISSING) e tratá-lo
 * como execução interrompida — nunca retomar o waterfall automaticamente.
 */
const activeRuns = new Map<string, DossierRunContext>();

const STORAGE_KEY = 'scout360:active_dossier_run';

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

function persist(): void {
  if (!isStorageAvailable() || activeRuns.size === 0) {
    if (isStorageAvailable()) window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  const snapshot = Object.fromEntries(activeRuns.entries());
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function hydrate(): void {
  if (!isStorageAvailable() || activeRuns.size > 0) return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, DossierRunContext>;
    for (const [sessionId, context] of Object.entries(parsed)) {
      if (context && typeof context.sessionId === 'string' && typeof context.runId === 'string') {
        activeRuns.set(sessionId, context);
      }
    }
  } catch {
    // Storage corrompido: não bloqueia o boot; o estado é apenas diagnóstico.
  }
}

export function setActiveDossierRun(context: DossierRunContext): void {
  hydrate();
  activeRuns.set(context.sessionId, context);
  persist();
}
export function getActiveDossierRun(sessionId: string): DossierRunContext | null {
  hydrate();
  return activeRuns.get(sessionId) ?? null;
}
export function clearActiveDossierRun(sessionId: string, runId?: string): void {
  hydrate();
  const current = activeRuns.get(sessionId);
  if (current && (!runId || current.runId === runId)) activeRuns.delete(sessionId);
  persist();
}
export function clearAllActiveDossierRunsForTest(): void {
  activeRuns.clear();
  if (isStorageAvailable()) window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Simula reload: limpa apenas o Map em memória, preservando o sessionStorage
 * (que é o que sobrevive ao reload real da aba). Uso exclusivo em testes.
 */
export function clearActiveDossierRunsMemoryForTest(): void {
  activeRuns.clear();
}

/**
 * Retorna os runs persistidos no sessionStorage (sobrevivem ao reload) e os
 * remove do registro persistido. Usado no boot para detectar execução
 * interrompida sem contexto local.
 */
export function consumePersistedActiveDossierRuns(): DossierRunContext[] {
  hydrate();
  const entries = Array.from(activeRuns.entries());
  activeRuns.clear();
  persist();
  return entries.map(([, context]) => context);
}
