import type { Dispatch, SetStateAction } from 'react';
import { SHARED_FOUNDATION_BLOCK } from '../../prompts/megaPrompts';
import { generateDossierModule } from '../../services/llmService';
import { DOSSIER_OPTIONAL_STEP_TIMEOUT_MS as MODULAR_OPTIONAL_STEP_TIMEOUT_MS } from '../../services/llm/budgets';
import { joinDossierExtraContext } from '../../services/llm/foundation-cache';
import { type PortaDimension, type ScorePortaData } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
import { resolvePortaScore, type PortaScoreResolution } from '../../utils/porta';
import { isAbortLikeError } from '../../utils/abortHelpers';

const PORTA_RECONCILIATION_CONTEXT_WINDOW_CHARS = 12000;

const PORTA_DIMENSION_MODULE_MAP: Record<PortaDimension, string[]> = {
  P: ['Porte / Teia Societária'],
  O: ['Operação / Cadeia de Valor'],
  R: ['Riscos & Compliance'],
  T: ['Bordas de Controle'],
  A: ['Caminho de Venda'],
};

const PORTA_MARKER_TEMPLATES: Record<PortaDimension, string> = {
  P: '[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]',
  O: '[[PORTA_FEED_O:6:ELOS:Plantio]]',
  R: '[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]',
  T: '[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]',
  A: '[[PORTA_FEED_A:6:A1:6:A2:6:GERACAO:NA]]',
};

export interface DossierWaterfallModule {
  name: string;
  prompt: string;
  stage: string;
  optional: boolean;
  timeoutMs: number;
}

export type RunWaterfallModule = (
  module: DossierWaterfallModule,
  accumulatedText: string,
  contextHint?: string,
  timeoutMs?: number,
) => Promise<string>;

export interface ReconcileWaterfallPortaArgs {
  sessionId: string;
  signal: AbortSignal;
  resolvedMegaCompany: string;
  sessionCnpjDigits: string;
  dossierSeedContext: string;
  waterfallLookupContext: string;
  seniorEvidenceContext: string;
  staticDossierContext: string;
  accumulatedText: string;
  modulesByName: Map<string, DossierWaterfallModule>;
  runWaterfallModule: RunWaterfallModule;
  optionalStepFailures: Set<string>;
  setFailureCount: Dispatch<SetStateAction<number>>;
}

export interface ReconcileWaterfallPortaResult {
  accumulatedText: string;
  resolution: PortaScoreResolution;
  portaIntegrityHold: boolean;
}

export function resolveModuleNamesForMissingDimensions(missingDimensions: PortaDimension[]): string[] {
  return Array.from(new Set(missingDimensions.flatMap(dimension => PORTA_DIMENSION_MODULE_MAP[dimension] || [])));
}

export function buildPortaReconciliationPrompt(missingDimensions: PortaDimension[]): string {
  const uniqueMissingDimensions = Array.from(new Set(missingDimensions));
  const requiredTemplates = uniqueMissingDimensions
    .map(dimension => `- ${dimension}: ${PORTA_MARKER_TEMPLATES[dimension]}`)
    .join('\n');

  return `
MISSÃO: Reconciliação final do Score PORTA.

Você receberá o contexto consolidado da investigação já executada.
Seu trabalho é emitir SOMENTE os markers PORTA faltantes para as dimensões abaixo.

DIMENSÕES FALTANTES: ${uniqueMissingDimensions.join(', ')}

REGRAS OBRIGATÓRIAS:
1. Saída sem explicações e sem markdown: apenas linhas de markers.
2. Use APENAS os formatos abaixo para cada dimensão solicitada.
3. Todas as notas devem ser inteiras de 0 a 10.
4. Não repita dimensões que não foram solicitadas.

FORMATOS POR DIMENSÃO:
${requiredTemplates}
`.trim();
}

export function ensureWaterfallScorePorta(content: string, currentResolution: PortaScoreResolution): ScorePortaData {
  if (currentResolution.score) return currentResolution.score;

  const resolvedAgain = resolvePortaScore(content);
  if (resolvedAgain.score) return resolvedAgain.score;

  throw new Error('Score PORTA não pôde ser consolidado após todas as tentativas.');
}

export function shouldHoldWaterfallScoreForIntegrity(currentResolution: PortaScoreResolution): boolean {
  return !currentResolution.score && currentResolution.missingDimensions.length === 5;
}

export async function reconcileWaterfallPorta({
  sessionId,
  signal,
  resolvedMegaCompany,
  sessionCnpjDigits,
  dossierSeedContext,
  waterfallLookupContext,
  seniorEvidenceContext,
  staticDossierContext,
  accumulatedText,
  modulesByName,
  runWaterfallModule,
  optionalStepFailures,
  setFailureCount,
}: ReconcileWaterfallPortaArgs): Promise<ReconcileWaterfallPortaResult> {
  let nextAccumulatedText = accumulatedText;
  let portaIntegrityHold = false;

  const appendWaterfallChunk = (chunk: string) => {
    const normalizedChunk = chunk.trim();
    if (!normalizedChunk) return;
    nextAccumulatedText += (nextAccumulatedText ? '\n\n---\n\n' : '') + normalizedChunk;
  };

  let waterfallPortaResolution = resolvePortaScore(nextAccumulatedText);
  if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
    scoutDiag.warn('ModularDossier', 'dimensões PORTA ausentes após 1ª passada', {
      sessionId,
      company: resolvedMegaCompany || null,
      source: waterfallPortaResolution.source,
      missingDimensions: waterfallPortaResolution.missingDimensions,
    });

    const retryModuleNames = resolveModuleNamesForMissingDimensions(waterfallPortaResolution.missingDimensions);
    for (const moduleName of retryModuleNames) {
      if (signal.aborted) break;
      const module = modulesByName.get(moduleName);
      if (!module) continue;

      scoutDiag.info?.('ModularDossier', 'retry de módulo para consolidar PORTA', {
        sessionId,
        company: resolvedMegaCompany || null,
        moduleName,
        missingDimensions: waterfallPortaResolution.missingDimensions,
      });

      try {
        const retryContextHintBase = `Reexecução obrigatória para consolidar dimensões PORTA faltantes: ${waterfallPortaResolution.missingDimensions.join(', ')}.`;
        const retryContextCnpjHint =
          sessionCnpjDigits.length === 14
            ? ` Use obrigatoriamente o CNPJ ${sessionCnpjDigits} como chave de entidade desta conta.`
            : '';
        const retryResult = await runWaterfallModule(
          module,
          nextAccumulatedText,
          `${retryContextHintBase}${retryContextCnpjHint}`,
          MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        );

        appendWaterfallChunk(retryResult);
        optionalStepFailures.delete(moduleName);
        setFailureCount(0);
        scoutDiag.info?.('ModularDossier', 'retry de módulo concluído', {
          sessionId,
          company: resolvedMegaCompany || null,
          moduleName,
        });
      } catch (error) {
        if (isAbortLikeError(error)) throw error;

        optionalStepFailures.add(moduleName);
        setFailureCount(count => count + 1);
        scoutDiag.warn('ModularDossier', 'retry de módulo falhou', {
          sessionId,
          company: resolvedMegaCompany || null,
          moduleName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    waterfallPortaResolution = resolvePortaScore(nextAccumulatedText);
  }

  if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
    scoutDiag.warn('ModularDossier', 'acionando reconciliador de markers PORTA', {
      sessionId,
      company: resolvedMegaCompany || null,
      missingDimensions: waterfallPortaResolution.missingDimensions,
    });

    try {
      const reconciliationChunk = await generateDossierModule(
        'Reconciliação PORTA',
        resolvedMegaCompany || 'Empresa',
        SHARED_FOUNDATION_BLOCK,
        buildPortaReconciliationPrompt(waterfallPortaResolution.missingDimensions),
        joinDossierExtraContext(
          staticDossierContext,
          [
            `Contexto consolidado da rodada:\n${nextAccumulatedText.slice(-PORTA_RECONCILIATION_CONTEXT_WINDOW_CHARS)}`,
            `Dimensões pendentes para emissão de markers: ${waterfallPortaResolution.missingDimensions.join(', ')}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
        {
          signal,
          timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        },
      );

      appendWaterfallChunk(reconciliationChunk);
      scoutDiag.info?.('ModularDossier', 'reconciliador PORTA concluído', {
        sessionId,
        company: resolvedMegaCompany || null,
        emittedChars: reconciliationChunk.length,
      });
    } catch (error) {
      if (isAbortLikeError(error)) throw error;

      scoutDiag.error('ModularDossier', 'reconciliador PORTA falhou', {
        sessionId,
        company: resolvedMegaCompany || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    waterfallPortaResolution = resolvePortaScore(nextAccumulatedText);
  }

  if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
    portaIntegrityHold = shouldHoldWaterfallScoreForIntegrity(waterfallPortaResolution);
    if (portaIntegrityHold) {
      scoutDiag.error(
        'ModularDossier',
        'integridade PORTA comprometida — dimensões ausentes após retries e reconciliação',
        {
          sessionId,
          company: resolvedMegaCompany || null,
          missingDimensions: waterfallPortaResolution.missingDimensions,
        },
      );
    }
  }

  if (!portaIntegrityHold && !waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
    scoutDiag.error('ModularDossier', 'falha técnica na consolidação do score PORTA', {
      sessionId,
      company: resolvedMegaCompany || null,
      source: waterfallPortaResolution.source,
      missingDimensions: waterfallPortaResolution.missingDimensions,
    });

    throw new Error(
      `Falha técnica ao consolidar Score PORTA (dimensões ausentes: ${waterfallPortaResolution.missingDimensions.join(', ')})`,
    );
  }

  return {
    accumulatedText: nextAccumulatedText,
    resolution: waterfallPortaResolution,
    portaIntegrityHold,
  };
}
