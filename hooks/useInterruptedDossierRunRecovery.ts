import { useEffect } from 'react';
import { Sender, type ChatSession } from '../types';
import { consumePersistedActiveDossierRuns } from '../features/dossier/active-run-registry';
import { scoutDiag } from '../utils/diagnosticLog';

/**
 * Recuperação segura pós-reload do Dossier Flow (BRU-7 — Alternativa A).
 *
 * Quando a aba recarrega durante uma execução, o registro local (Map) é
 * perdido, mas o sessionStorage preserva o run persistido como ativo
 * (RUN_PERSISTED_AS_ACTIVE + LOCAL_ACTIVE_RUN_CONTEXT_MISSING).
 *
 * Este hook, executado uma vez no boot:
 * - NUNCA retoma o waterfall automaticamente;
 * - NUNCA classifica o run como COMPLETED;
 * - reseta qualquer estado de loading residual (isLoading=false);
 * - injeta uma mensagem explícita de interrupção na sessão afetada, com
 *   orientação de nova tentativa (o lease continua protegendo contra disputa
 *   via RPC; se expirado, o lifecycle permite nova tentativa);
 * - emite telemetria diagnóstica sem expor dados sensíveis;
 * - preserva o dossiê anterior (nenhuma escrita é feita aqui).
 */
export function useInterruptedDossierRunRecovery(options: {
  updateSessionById: (sessionId: string, updater: (session: ChatSession) => ChatSession) => ChatSession | null;
  setIsLoading: (loading: boolean) => void;
  resetLoadingProgress: () => void;
}) {
  const { updateSessionById, setIsLoading, resetLoadingProgress } = options;

  useEffect(() => {
    const interruptedRuns = consumePersistedActiveDossierRuns();
    if (interruptedRuns.length === 0) return;

    for (const run of interruptedRuns) {
      scoutDiag.warn('DossierRunLifecycle', 'reload_interrupted_run', {
        sessionId: run.sessionId,
        runId: run.runId,
        // Sem conteúdo de mensagem, empresa ou qualquer dado sensível.
      });
      updateSessionById(run.sessionId, session => ({
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
    }

    // Garante que nenhum estado de loading residual sobreviva ao reload.
    setIsLoading(false);
    resetLoadingProgress();
  }, [updateSessionById, setIsLoading, resetLoadingProgress]);
}
