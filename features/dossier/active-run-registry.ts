import type { DossierRunContext } from '../../lib/supabase/dossierRuns';

const activeRuns = new Map<string, DossierRunContext>();
export function setActiveDossierRun(context: DossierRunContext): void { activeRuns.set(context.sessionId, context); }
export function getActiveDossierRun(sessionId: string): DossierRunContext | null { return activeRuns.get(sessionId) ?? null; }
export function clearActiveDossierRun(sessionId: string, runId?: string): void {
  const current = activeRuns.get(sessionId);
  if (current && (!runId || current.runId === runId)) activeRuns.delete(sessionId);
}
export function clearAllActiveDossierRunsForTest(): void { activeRuns.clear(); }
