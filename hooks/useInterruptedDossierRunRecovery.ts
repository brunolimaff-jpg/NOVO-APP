import { useEffect } from 'react';
import { Sender, type ChatSession } from '../types';
import { peekPersistedActiveDossierRuns, removePersistedActiveDossierRuns } from '../features/dossier/active-run-registry';
import { scoutDiag } from '../utils/diagnosticLog';

/**
 * Recuperação segura pós-reload do Dossier Flow (BRU-7 — Alternativa A).
 *
 * Quando a aba recarrega durante uma execução, o registro local (Map) é
 * perdido, mas o sessionStorage preserva o run persistido como ativo
 * (RUN_PERSISTED_AS_ACTIVE + LOCAL_ACTIVE_RUN_CONTEXT_MISSING).
 *
 * Este hook, executado no boot APÓS isInitialized=true (sessões carregadas):
 * - NUNCA retoma o waterfall automaticamente;
 * - NUNCA classifica o run como COMPLETED;
 * - injeta uma mensagem explícita de interrupção na sessão afetada;
 * - remove o registro persistido SOMENTE quando a sessão existir e a
 *   mensagem for aplicada (updateSessionById retorna sessão atualizada);
 *   se a sessão ainda não existir, o registro é preservado para tentativa
 *   posterior — evitando a corrida com o loadSessions() assíncrono;
 * - emite telemetria diagnóstica sem expor dados sensíveis;
 * - preserva o dossiê anterior (nenhuma escrita destrutiva é feita).
 */
export function useInterruptedDossierRunRecovery(options: {
  isInitialized: boolean;
  updateSessionById: (sessionId: string, updater: (session: ChatSession) => ChatSession) => ChatSession | null;
  setIsLoading: (loading: boolean) => void;
  resetLoadingProgress: () => void;
}) {
  const { isInitialized, updateSessionById, setIsLoading, resetLoadingProgress } = options;

  useEffect(() => {
    // Só roda quando as sessões já foram carregadas (evita corrida com loadSessions).
    if (!isInitialized) return;

    scoutDiag.info('DossierRunLifecycle', 'recovery:mount', {
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
      navigationType:
        typeof performance !== 'undefined'
          ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown'
          : 'unknown',
    });

    const interruptedRuns = peekPersistedActiveDossierRuns();
    if (interruptedRuns.length === 0) return;

    scoutDiag.warn('DossierRunLifecycle', 'recovery:found-persisted-run', {
      count: interruptedRuns.length,
      runIds: interruptedRuns.map(run => run.runId),
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
    });

    const appliedRunIds: string[] = [];
    const pendingRunIds: string[] = [];
    for (const run of interruptedRuns) {
      const updated = updateSessionById(run.sessionId, session => ({
        ...session,
        messages: [
          ...(session.messages ?? []),
          {
            id: `dossier-interrupted-${run.runId}`,
            sender: Sender.Bot,
            text: 'A execução do dossiê foi interrompida pelo recarregamento da página. ' +
              'Nenhum dossiê foi marcado como concluído. Você pode iniciar uma nova tentativa quando quiser.',
            timestamp: new Date(),
            isError: true,
          },
        ],
      }));
      if (updated) {
        appliedRunIds.push(run.runId);
        scoutDiag.warn('DossierRunLifecycle', 'reload_interrupted_run', {
          sessionId: run.sessionId,
          runId: run.runId,
          // Sem conteúdo de mensagem, empresa ou qualquer dado sensível.
        });
      } else {
        // Sessão ainda não carregada: preserva o registro para a próxima
        // execução do effect (isInitialized=true já garante que loadSessions
        // terminou; se ainda assim não existir, o registro permanece até a
        // sessão ser criada — nunca é descartado sem aplicação).
        pendingRunIds.push(run.runId);
        scoutDiag.warn('DossierRunLifecycle', 'reload_interrupted_run_session_missing', {
          sessionId: run.sessionId,
          runId: run.runId,
        });
      }
    }

    // Remove apenas os runs cuja mensagem foi aplicada a uma sessão existente.
    if (appliedRunIds.length > 0) removePersistedActiveDossierRuns(appliedRunIds);

    if (pendingRunIds.length === 0) {
      // Garante que nenhum estado de loading residual sobreviva ao reload.
      setIsLoading(false);
      resetLoadingProgress();
    }
  }, [isInitialized, updateSessionById, setIsLoading, resetLoadingProgress]);
}
