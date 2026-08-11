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
  // Observabilidade P0 01E: somente metadados do lifecycle; nenhum conteúdo.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('scout:dossier-active-run', {
        detail: {
          event: 'active-run:set',
          sessionId: context.sessionId,
          runId: context.runId,
          visibilityState: document.visibilityState,
          performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
        },
      }));
    } catch {
      // Observabilidade nunca pode bloquear o registro do run.
    }
  }
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
 * Retorna os runs persistidos no sessionStorage (sobrevivem ao reload) SEM
 * removê-los. Usado no boot para detectar execução interrompida; a remoção
 * só deve ocorrer via removePersistedActiveDossierRuns após a mensagem ser
 * efetivamente aplicada a uma sessão carregada.
 */
export function peekPersistedActiveDossierRuns(): DossierRunContext[] {
  hydrate();
  return Array.from(activeRuns.values());
}

/**
 * Remove do registro persistido apenas os runIds informados (aplicados com
 * sucesso a uma sessão existente). Runs não listados permanecem persistidos
 * para tentativa posterior.
 */
export function removePersistedActiveDossierRuns(runIds: string[]): void {
  hydrate();
  const toRemove = new Set(runIds);
  for (const [sessionId, context] of Array.from(activeRuns.entries())) {
    if (toRemove.has(context.runId)) activeRuns.delete(sessionId);
  }
  persist();
}

/**
 * Consome todos os runs persistidos (entrega e limpa). Uso reservado a
 * caminhos onde a aplicação da mensagem é garantida ou para testes.
 */
export function consumePersistedActiveDossierRuns(): DossierRunContext[] {
  const entries = peekPersistedActiveDossierRuns();
  removePersistedActiveDossierRuns(entries.map(run => run.runId));
  return entries;
}
