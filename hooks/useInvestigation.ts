import { useCallback, useRef, useState } from 'react';
import { buildInvestigationHiddenPrompt, PROMPT_VERSION } from '../prompts/megaPrompts';
import { fetchCompanyByCnpj } from '../services/brasilApiService';
import { storage } from '../services/storage';
import { trackOperatorEvent } from '../services/operatorTracking';
import { logDossierAccess } from '../services/dossierAccessService';
import { scoutDiag } from '../utils/diagnosticLog';
import { resolvePromptMode, shouldIncludeBudgetPrompt, buildRadarContextBlock } from '../utils/promptResolvers';
import { findExistingDossier, type ExistingDossier } from '../lib/supabase/dossierDuplicate';
import { supabase } from '../lib/supabaseClient';
import type { ChatSession } from '../types';
import type { RadarProps, StartInvestigationPayload } from '../components/chat/contracts';

interface UseInvestigationParams {
  mode: unknown;
  canWarRoom: boolean;
  onDeepDive: (prompt: string, hiddenPrompt: string, companyName: string, cnpj?: string) => Promise<void>;
  radar?: RadarProps;
  operatorId: string;
  onSelectSession: (sessionId: string) => void;
}

export function useInvestigation({
  mode,
  canWarRoom,
  onDeepDive,
  radar,
  operatorId,
  onSelectSession,
}: UseInvestigationParams) {
  const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
  const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);

  const executeInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      const prompt = `🔍 Investigando ${payload.companyName}...`;
      const promptMode = resolvePromptMode(mode, canWarRoom);

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
          includeBudget: shouldIncludeBudgetPrompt(payload, promptMode, radar),
          mode: promptMode,
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
          promptVersion: PROMPT_VERSION,
        },
      );
      const hiddenPrompt = [hiddenPromptBase, buildRadarContextBlock(radar)].filter(Boolean).join('\n\n');
      await onDeepDive(prompt, hiddenPrompt, payload.companyName, payload.cnpj ?? undefined);
    },
    [mode, canWarRoom, onDeepDive, radar],
  );

  const handleStartInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      if (payload.cnpj || payload.companyName) {
        const existing = await findExistingDossier(payload.cnpj, payload.companyName, operatorId || '');
        if (existing) {
          pendingPayloadRef.current = payload;
          setDuplicateDossier(existing);
          return;
        }
      }

      await executeInvestigation(payload);
    },
    [operatorId, executeInvestigation],
  );

  const handleAccessExistingDossier = useCallback(async () => {
    if (!duplicateDossier || !operatorId) return;

    let dossier = await storage.getDossier(duplicateDossier.id);
    if (!dossier) {
      if (!supabase) {
        setDuplicateDossier(null);
        pendingPayloadRef.current = null;
        return;
      }
      const { data } = await supabase.from('dossies').select('content').eq('id', duplicateDossier.id).maybeSingle();
      if (!data || !data.content) {
        setDuplicateDossier(null);
        pendingPayloadRef.current = null;
        return;
      }
      dossier = data.content as ChatSession;
      await storage.saveDossier(dossier!);
    }

    await logDossierAccess(duplicateDossier.id, operatorId, pendingPayloadRef.current?.cnpj);

    onSelectSession(duplicateDossier.id);
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;
    trackOperatorEvent('dossier_reopened', {
      operatorId,
      entityId: duplicateDossier.id,
      entityType: 'dossier',
      companyName: duplicateDossier.empresaAlvo,
    });
  }, [duplicateDossier, operatorId, onSelectSession]);

  const handleNewResearchOverride = useCallback(async () => {
    const payload = pendingPayloadRef.current;
    const oldDossier = duplicateDossier;
    if (!payload || !operatorId) return;

    try {
      await executeInvestigation(payload);

      if (oldDossier) {
        await logDossierAccess(oldDossier.id, operatorId, payload.cnpj);
        await storage.deleteDossier(oldDossier.id);
      }

      trackOperatorEvent('dossier_override', {
        operatorId: operatorId || '',
        previousDossierId: oldDossier?.id,
        entityType: 'dossier',
        companyName: payload.companyName,
      });
    } catch (error) {
      scoutDiag.warn('ChatInterface', 'Falha ao sobrescrever dossiê', {
        previousDossierId: oldDossier?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDuplicateDossier(null);
      pendingPayloadRef.current = null;
    }
  }, [duplicateDossier, executeInvestigation, operatorId]);

  return {
    executeInvestigation,
    handleStartInvestigation,
    handleAccessExistingDossier,
    handleNewResearchOverride,
    duplicateDossier,
    setDuplicateDossier,
    pendingPayloadRef,
  };
}
