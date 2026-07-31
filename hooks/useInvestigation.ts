import { useCallback, useRef, useState } from 'react';
import { buildInvestigationHiddenPrompt, PROMPT_VERSION } from '../prompts/megaPrompts';
import { fetchCompanyByCnpj } from '../services/brasilApiService';
import { storage } from '../services/storage';
import { trackOperatorEvent } from '../services/operatorTracking';
import { scoutDiag } from '../utils/diagnosticLog';
import { resolvePromptMode, shouldIncludeBudgetPrompt } from '../utils/promptResolvers';
import {
  findExistingDossier,
  reuseDossierForCurrentOperator,
  type ExistingDossier,
} from '../lib/supabase/dossierDuplicate';
import type { ChatSession } from '../types';
import type { StartInvestigationPayload } from '../components/chat/contracts';

interface UseInvestigationParams {
  mode: unknown;
  onDeepDive: (prompt: string, hiddenPrompt: string, companyName: string, cnpj?: string) => Promise<void>;
  operatorId: string;
  onOpenLoadedSession: (session: ChatSession) => void;
}

export function useInvestigation({
  mode,
  onDeepDive,
  operatorId,
  onOpenLoadedSession,
}: UseInvestigationParams) {
  const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
  const [isAccessingDossier, setIsAccessingDossier] = useState(false);
  const [accessDossierError, setAccessDossierError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);
  const processingRef = useRef(false);

  const executeInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
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
      await onDeepDive(prompt, hiddenPromptBase, payload.companyName, payload.cnpj ?? undefined);
    },
    [mode, onDeepDive],
  );

  const handleStartInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      if (processingRef.current) return;
      setDiscoveryError(null);

      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      if (payload.cnpj || payload.companyName) {
        processingRef.current = true;
        try {
          const discovery = await findExistingDossier(payload.cnpj, payload.companyName, operatorId || '');
          if (discovery.status === 'FOUND') {
            pendingPayloadRef.current = payload;
            setAccessDossierError(null);
            setDuplicateDossier(discovery.dossier);
            return;
          }
          if (discovery.status !== 'NOT_FOUND') {
            setDiscoveryError(
              'Não foi possível verificar dossiês existentes. Tente novamente antes de iniciar uma nova pesquisa.',
            );
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
    processingRef.current = true;
    setIsAccessingDossier(true);
    setAccessDossierError(null);

    const sourceDossierId = duplicateDossier.id;
    const dossierEmpresaAlvo = duplicateDossier.empresaAlvo;

    try {
      const reused = await reuseDossierForCurrentOperator(sourceDossierId);
      onOpenLoadedSession(reused.content);
      trackOperatorEvent('dossier_reopened', {
        operatorId,
        entityId: reused.dossierId,
        entityType: 'dossier',
        companyName: dossierEmpresaAlvo,
      });
      setDuplicateDossier(null);
      pendingPayloadRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o dossiê';
      setAccessDossierError(message);
      scoutDiag.warn('Investigation', 'Falha ao reutilizar dossiê', {
        sourceDossierId,
        error: message,
      });
    } finally {
      processingRef.current = false;
      setIsAccessingDossier(false);
    }
  }, [duplicateDossier, operatorId, onOpenLoadedSession]);

  const handleNewResearchOverride = useCallback(async () => {
    if (processingRef.current) return;
    const payload = pendingPayloadRef.current;
    const oldDossier = duplicateDossier;
    if (!payload || !operatorId) return;
    processingRef.current = true;

    // Esconde modal IMEDIATAMENTE — antes da geração que leva minutos
    const oldDossierId = oldDossier?.id;
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;

    try {
      await executeInvestigation(payload);

      if (oldDossierId) {
        await storage.deleteDossier(oldDossierId);
      }

      trackOperatorEvent('dossier_override', {
        operatorId: operatorId || '',
        previousDossierId: oldDossierId,
        entityType: 'dossier',
        companyName: payload.companyName,
      });
    } catch (error) {
      scoutDiag.warn('ChatInterface', 'Falha ao sobrescrever dossiê', {
        previousDossierId: oldDossierId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      processingRef.current = false;
    }
  }, [duplicateDossier, executeInvestigation, operatorId]);

  return {
    executeInvestigation,
    handleStartInvestigation,
    handleAccessExistingDossier,
    handleNewResearchOverride,
    duplicateDossier,
    isAccessingDossier,
    accessDossierError,
    discoveryError,
    setDuplicateDossier,
    pendingPayloadRef,
  };
}
