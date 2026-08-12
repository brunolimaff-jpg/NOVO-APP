import { useCallback, useRef, useState } from 'react';
import { buildInvestigationHiddenPrompt, PROMPT_VERSION } from '../prompts/megaPrompts';
import { fetchCompanyByCnpj } from '../services/brasilApiService';
import { storage } from '../services/storage';
import { trackOperatorEvent } from '../services/operatorTracking';
import { logDossierAccess } from '../services/dossierAccessService';
import { scoutDiag } from '../utils/diagnosticLog';
import { resolvePromptMode, shouldIncludeBudgetPrompt } from '../utils/promptResolvers';
import { findExistingDossier, type ExistingDossier } from '../lib/supabase/dossierDuplicate';
import { supabase } from '../lib/supabaseClient';
import type { ChatSession, DossierWaterfallResult } from '../types';
import type { StartInvestigationPayload } from '../components/chat/contracts';

/** Telemetria best-effort — nunca bloqueia reopen/override. */
async function safeLogDossierAccess(dossierId: string, operatorId: string, cnpj?: string | null): Promise<void> {
  try {
    await logDossierAccess(dossierId, operatorId, cnpj);
  } catch {
    // logDossierAccess já faz warn interno; exceções inesperadas não travam UX.
  }
}

interface UseInvestigationParams {
  mode: unknown;
  onDeepDive: (
    prompt: string,
    hiddenPrompt: string,
    companyName: string,
    cnpj?: string,
    targetSessionId?: string,
  ) => Promise<DossierWaterfallResult | null | undefined>;
  operatorId: string;
  onSelectSession: (sessionId: string) => void;
  /** BRU-81 (P0): remove a "Nova Investigação" vazia criada só para a tentativa.
   *  O implementador deve validar isSessionReusable ANTES de remover. */
  onCleanupTransientSession?: (sessionId: string) => void;
  currentSessionId?: string | null;
}

export function useInvestigation({
  mode,
  onDeepDive,
  operatorId,
  onSelectSession,
  onCleanupTransientSession,
  currentSessionId = null,
}: UseInvestigationParams) {
  const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
  const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);
  const processingRef = useRef(false);

  const executeInvestigation = useCallback(
    async (payload: StartInvestigationPayload, targetSessionId?: string) => {
      const prompt = `🔍 Investigando ${payload.companyName}...`;
      const promptMode = resolvePromptMode(mode);

      let segmentHint: string | undefined;
      if (payload.cnpj) {
        try {
          const signal = AbortSignal.timeout(8000);
          const companyData = await fetchCompanyByCnpj(payload.cnpj, signal);
          if (companyData.cnaeDescricao) {
            segmentHint = companyData.cnaeDescricao;
          }
        } catch (error) {
          scoutDiag.warn('ChatInterface', 'Falha ao buscar CNAE', { cnpj: payload.cnpj, error });
        }
      }

      const hiddenPromptBase = buildInvestigationHiddenPrompt(
        {
          companyName: payload.companyName,
          cnpj: payload.cnpj || undefined,
          city: payload.city,
          state: payload.state,
          segmentHint,
        },
        {
          includeBudget: shouldIncludeBudgetPrompt(payload, promptMode),
          mode: promptMode,
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
          promptVersion: PROMPT_VERSION,
        },
      );
      return onDeepDive(prompt, hiddenPromptBase, payload.companyName, payload.cnpj ?? undefined, targetSessionId);
    },
    [mode, onDeepDive],
  );

  const handleStartInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      if (processingRef.current) return;

      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      if (payload.cnpj || payload.companyName) {
        processingRef.current = true;
        try {
          const existing = await findExistingDossier(payload.cnpj, payload.companyName, operatorId || '');
          if (existing) {
            pendingPayloadRef.current = payload;
            setDuplicateDossier(existing);
            return;
          }
        } finally {
          processingRef.current = false;
        }
      }

      processingRef.current = true;
      try {
        await executeInvestigation(payload);
      } finally {
        processingRef.current = false;
      }
    },
    [operatorId, executeInvestigation],
  );

  const handleAccessExistingDossier = useCallback(async () => {
    if (processingRef.current || !duplicateDossier || !operatorId) return;

    // GUARDA FAIL-CLOSED (BRU-11 camada 1): dossiê de outro operador é bloqueado
    // ANTES de qualquer leitura, cópia, persistência, seleção ou reabertura.
    // Descoberta por CNPJ não é autorização — nenhum content estrangeiro é consultado.
    if (duplicateDossier.operatorId !== operatorId) {
      scoutDiag.warn('Investigation', 'foreign-dossier-access-blocked', {
        dossierId: duplicateDossier.id,
        reason: 'owner_mismatch_fail_closed',
      });
      return;
    }

    processingRef.current = true;

    // Esconde modal IMEDIATAMENTE — antes de qualquer await
    const dossierId = duplicateDossier.id;
    const dossierEmpresaAlvo = duplicateDossier.empresaAlvo;
    const cnpj = pendingPayloadRef.current?.cnpj;
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;

    try {
      let dossier = await storage.getDossier(dossierId);
      if (!dossier) {
        if (!supabase) return;
        const { data } = await supabase.from('dossies').select('content').eq('id', dossierId).maybeSingle();
        if (!data || !data.content) return;
        dossier = data.content as ChatSession;
        await storage.saveDossier(dossier!);
      }

      void safeLogDossierAccess(dossierId, operatorId, cnpj);

      onSelectSession(dossierId);
      trackOperatorEvent('dossier_reopened', {
        operatorId,
        entityId: dossierId,
        entityType: 'dossier',
        companyName: dossierEmpresaAlvo,
      });
    } finally {
      processingRef.current = false;
    }
  }, [duplicateDossier, operatorId, onSelectSession]);

  const handleNewResearchOverride = useCallback(async () => {
    if (processingRef.current) return;
    const payload = pendingPayloadRef.current;
    const oldDossier = duplicateDossier;
    if (!payload || !operatorId) return;
    processingRef.current = true;

    // GUARDA FAIL-CLOSED (BRU-11 camada 1): a fonte estrangeira nunca é lida,
    // deletada, logada como reaberta ou usada como ID da nova investigação.
    const isForeignSource = oldDossier ? oldDossier.operatorId !== operatorId : false;

    // Esconde modal IMEDIATAMENTE — antes da geração que leva minutos
    const oldDossierId = oldDossier?.id;
    const oldDossierCnpj = payload.cnpj;
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;

    try {
      // BRU-81 (P0): mantém uma thread por conta — quando a "nova pesquisa do zero"
      // parte de um dossiê PRÓPRIO já existente, volta para a thread da conta (UI) e
      // informa o sessionId alvo como EXPLÍCITO na execução. O targetSessionId flui
      // por valor até o handleSendMessage (explicitSessionId), sem depender de
      // "esperar React rerenderizar" — eliminando o risco de stale closure do
      // currentSessionId apontar para a sessão anterior.
      // Guarda fail-closed preservada: fonte estrangeira nunca é selecionada/lida.
      const targetSessionId = oldDossierId && !isForeignSource ? oldDossierId : undefined;
      // Sessão transitória A (ex: "Nova Investigação" vazia criada para esta
      // tentativa) — não pode ficar órfã no sidebar. O chamador só a remove se
      // provar que é vazia/reutilizável (isSessionReusable); nunca por delete remoto.
      const transientSessionId =
        oldDossierId && !isForeignSource && currentSessionId !== oldDossierId ? currentSessionId : undefined;
      if (oldDossierId && !isForeignSource && currentSessionId !== oldDossierId) {
        await onSelectSession(oldDossierId);
      }
      if (transientSessionId && onCleanupTransientSession) {
        onCleanupTransientSession(transientSessionId);
      }

      const result = await executeInvestigation(payload, targetSessionId);

      // Opção B (segurança transacional, BRU-81): B antigo → transação atômica → B novo.
      // A promoção server-owned JÁ substituiu o conteúdo de B no commit terminal —
      // NÃO existe "dossiê antigo separado" para deletar. deleteDossier(B) eliminado.
      const investigationSucceeded =
        result?.status === 'COMPLETED' &&
        Boolean(result.dossierId) &&
        (result.dossierId ? (await storage.getDossier(result.dossierId)) !== null : false);

      // A fonte estrangeira permanece INTOCADA: sem delete, sem log de acesso,
      // sem evento de override — o usuário apenas gerou um dossiê novo próprio.
      if (oldDossierId && !isForeignSource && investigationSucceeded) {
        void safeLogDossierAccess(oldDossierId, operatorId, oldDossierCnpj);

        trackOperatorEvent('dossier_override', {
          operatorId: operatorId || '',
          previousDossierId: oldDossierId,
          entityType: 'dossier',
          companyName: payload.companyName,
        });
      } else if (oldDossierId && isForeignSource && investigationSucceeded) {
        scoutDiag.warn('Investigation', 'foreign-source-preserved-on-new-research', {
          previousDossierId: oldDossierId,
          resultStatus: result?.status ?? 'rejected',
        });
      } else {
        scoutDiag.warn('ChatInterface', 'dossier-override-preserved-previous', {
          previousDossierId: oldDossierId,
          resultStatus: result?.status ?? 'rejected',
        });
      }
    } catch (error) {
      scoutDiag.warn('ChatInterface', 'Falha ao sobrescrever dossiê — dossiê anterior preservado', {
        previousDossierId: oldDossierId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      processingRef.current = false;
    }
  }, [duplicateDossier, executeInvestigation, operatorId, currentSessionId, onSelectSession, onCleanupTransientSession]);

  return {
    executeInvestigation,
    handleStartInvestigation,
    handleAccessExistingDossier,
    handleNewResearchOverride,
    duplicateDossier,
    setDuplicateDossier,
    pendingPayloadRef,
    // BRU-11 camada 1: classificação fail-closed — o modal bloqueia qualquer
    // ação de acesso quando o dossiê descoberto pertence a outro operador.
    isForeignDossier: duplicateDossier ? duplicateDossier.operatorId !== operatorId : false,
  };
}
