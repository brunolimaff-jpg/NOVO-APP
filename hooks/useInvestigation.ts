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

const DUPLICATE_LOOKUP_TIMEOUT_MS = 6_000;

/** Telemetria best-effort — nunca bloqueia reopen/override. */
async function safeLogDossierAccess(dossierId: string, operatorId: string, cnpj?: string | null): Promise<void> {
  try {
    await logDossierAccess(dossierId, operatorId, cnpj);
  } catch {
    // logDossierAccess já faz warn interno; exceções inesperadas não travam UX.
  }
}

async function findExistingDossierBounded(
  cnpj: string | null | undefined,
  empresaAlvo: string | null | undefined,
  operatorId: string,
): Promise<ExistingDossier | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      findExistingDossier(cnpj, empresaAlvo, operatorId),
      new Promise<null>(resolve => {
        timeoutId = setTimeout(() => {
          scoutDiag.warn('Investigation', 'duplicate lookup timeout; seguindo com nova investigação', {
            cnpj: cnpj ? cnpj.replace(/\D/g, '') : null,
            empresaAlvo: empresaAlvo || null,
            operatorId,
            timeoutMs: DUPLICATE_LOOKUP_TIMEOUT_MS,
          });
          resolve(null);
        }, DUPLICATE_LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

interface UseInvestigationParams {
  mode: unknown;
  canWarRoom: boolean;
  onDeepDive: (prompt: string, hiddenPrompt: string, companyName: string, cnpj?: string) => Promise<void>;
  radar?: RadarProps;
  operatorId: string;
  onSelectSession: (sessionId: string) => void;
  toast?: { error: (message: string) => void };
}

export function useInvestigation({
  mode,
  canWarRoom,
  onDeepDive,
  radar,
  operatorId,
  onSelectSession,
  toast,
}: UseInvestigationParams) {
  const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
  const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);
  const processingRef = useRef(false);

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
      if (processingRef.current) return;

      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      if (payload.cnpj || payload.companyName) {
        processingRef.current = true;
        try {
          const existing = await findExistingDossierBounded(payload.cnpj, payload.companyName, operatorId || '');
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
        if (!supabase) {
          toast?.error('Não foi possível carregar esta sessão');
          scoutDiag.warn('Investigation', 'Falha ao carregar dossiê remoto', { dossierId, reason: 'supabase_unavailable' });
          return;
        }
        const { data, error } = await supabase.from('dossies').select('content').eq('id', dossierId).maybeSingle();
        if (error || !data || !data.content) {
          toast?.error('Não foi possível carregar esta sessão');
          scoutDiag.warn('Investigation', 'Falha ao carregar dossiê remoto', {
            dossierId,
            reason: error ? 'supabase_error' : 'missing_content',
            error: error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error || ''),
          });
          return;
        }
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
  }, [duplicateDossier, operatorId, onSelectSession, toast]);

  const handleNewResearchOverride = useCallback(async () => {
    if (processingRef.current) return;
    const payload = pendingPayloadRef.current;
    const oldDossier = duplicateDossier;
    if (!payload || !operatorId) return;
    processingRef.current = true;

    // Esconde modal IMEDIATAMENTE — antes da geração que leva minutos
    const oldDossierId = oldDossier?.id;
    const oldDossierCnpj = payload.cnpj;
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;

    try {
      await executeInvestigation(payload);

      if (oldDossierId) {
        void safeLogDossierAccess(oldDossierId, operatorId, oldDossierCnpj);
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
    setDuplicateDossier,
    pendingPayloadRef,
  };
}
