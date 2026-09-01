import { useEffect } from 'react';
import { Sender, type ChatSession } from '../types';
import { peekPersistedActiveDossierRuns, removePersistedActiveDossierRuns } from '../features/dossier/active-run-registry';
import { getDossierRun } from '../lib/supabase/dossierRuns';
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

    let cancelled = false;

    const reconcile = async () => {
      const interruptedRuns = peekPersistedActiveDossierRuns();
      if (interruptedRuns.length === 0) return;

      // BRU-156: estado remoto terminal vence o marcador local de reload.
      // Um run que já terminou (COMPLETED/FAILED/CANCELLED no Supabase) não
      // pode ser anunciado como "interrompido" — o dossiê persistido é a
      // verdade canônica, mesmo quando o registro local sobreviveu ao reload
      // por milissegundos (corrida boot × finally do orchestrator).
      const appliedRunIds: string[] = [];
      const pendingRunIds: string[] = [];
      const staleRunIds: string[] = [];
      for (const run of interruptedRuns) {
        let remoteStatus: string | null;
        try {
          const remote = await getDossierRun(run.runId);
          remoteStatus = remote?.status ?? null;
          // BRU-162/P3: run consultado com sucesso mas SEM status terminal
          // (null/undefined/PENDING) na corrida boot×finally — não é terminal,
          // não é falha de consulta: registra para diagnosticar a janela.
          if (!remoteStatus) {
            scoutDiag.info('DossierRunLifecycle', 'reload_run_remote_status_unavailable', {
              sessionId: run.sessionId,
              runId: run.runId,
              remoteFound: Boolean(remote),
            });
          }
        } catch (error) {
          // BRU-162/P3: falha de consulta AGORA é visível (antes era um catch
          // silencioso que mascarava o falso "interrompido" no run 3f0e7569 —
          // o RPC pode ter falhado por RLS/owner e virou mensagem de erro na UI).
          remoteStatus = null;
          scoutDiag.warn('DossierRunLifecycle', 'reload_run_remote_lookup_failed', {
            sessionId: run.sessionId,
            runId: run.runId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (cancelled) return;

        if (remoteStatus === 'COMPLETED' || remoteStatus === 'FAILED' || remoteStatus === 'CANCELLED') {
          // Run já terminal remotamente: descarta o marcador local sem
          // injetar mensagem de interrupção (o dossiê/estado real já está na UI).
          staleRunIds.push(run.runId);
          scoutDiag.info('DossierRunLifecycle', 'reload_run_already_terminal', {
            sessionId: run.sessionId,
            runId: run.runId,
            remoteStatus,
          });
          continue;
        }

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

      // Remove apenas os runs cujo tratamento foi concluído (aplicado ou
      // reconciliado com o estado remoto terminal).
      const resolved = [...appliedRunIds, ...staleRunIds];
      if (resolved.length > 0) removePersistedActiveDossierRuns(resolved);

      if (pendingRunIds.length === 0) {
        // Garante que nenhum estado de loading residual sobreviva ao reload.
        setIsLoading(false);
        resetLoadingProgress();
      }
    };

    void reconcile();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, updateSessionById, setIsLoading, resetLoadingProgress]);
}
