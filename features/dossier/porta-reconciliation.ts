import type { Dispatch, SetStateAction } from 'react';
import { SHARED_FOUNDATION_BLOCK } from '../../prompts/megaPrompts';
import { generateDossierModule } from '../../services/geminiService';
import { type PortaDimension, type ScorePortaData } from '../../types';
import { isAbortLikeError } from '../../utils/conversationFlow';
import { scoutDiag } from '../../utils/diagnosticLog';
import { resolvePortaScore, type PortaScoreResolution } from '../../utils/porta';

const MODULAR_OPTIONAL_STEP_TIMEOUT_MS = 60000;

const HARD_WATERFALL_SCORE_FALLBACK: ScorePortaData = {
  score: 60,
  p: 6,
  o: 6,
  r: 6,
  t: 6,
  a: 6,
  segmento: 'PRD',
  flags: [],
  scoreBruto: 60,
};

const PORTA_DIMENSION_MODULE_MAP: Record<PortaDimension, string[]> = {
  P: ['Estratégia & Expansão'],
  O: ['Raio-X Operacional'],
  R: ['Riscos & Compliance'],
  T: ['Tech Stack'],
  A: ['RH & Decisores'],
};

const PORTA_FALLBACK_MARKERS: Record<PortaDimension, string> = {
  P: '[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]',
  O: '[[PORTA_FEED_O:6:ELOS:Plantio]]',
  R: '[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]',
  T: '[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]',
  A: '[[PORTA_FEED_A:6:A1:6:A2:6:GERACAO:NA]]',
};

export interface PortaTechnicalFallbackResult {
  content: string;
  resolution: PortaScoreResolution;
  fallbackApplied: boolean;
  fallbackDimensions: PortaDimension[];
}

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
  accumulatedText: string;
  modulesByName: Map<string, DossierWaterfallModule>;
  runWaterfallModule: RunWaterfallModule;
  optionalStepFailures: Set<string>;
  setFailureCount: Dispatch<SetStateAction<number>>;
}

export interface ReconcileWaterfallPortaResult {
  accumulatedText: string;
  resolution: PortaScoreResolution;
  portaFallbackApplied: boolean;
  portaFallbackDimensions: PortaDimension[];
  portaIntegrityHold: boolean;
}

export function resolveModuleNamesForMissingDimensions(missingDimensions: PortaDimension[]): string[] {
  return Array.from(
    new Set(missingDimensions.flatMap(dimension => PORTA_DIMENSION_MODULE_MAP[dimension] || [])),
  );
}

export function buildPortaReconciliationPrompt(missingDimensions: PortaDimension[]): string {
  const uniqueMissingDimensions = Array.from(new Set(missingDimensions));
  const requiredTemplates = uniqueMissingDimensions
    .map(dimension => `- ${dimension}: ${PORTA_FALLBACK_MARKERS[dimension]}`)
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

export function buildPortaFallbackChunk(missingDimensions: PortaDimension[]): string {
  const uniqueMissingDimensions = Array.from(new Set(missingDimensions));
  if (uniqueMissingDimensions.length === 0) return '';
  return uniqueMissingDimensions
    .map(dimension => PORTA_FALLBACK_MARKERS[dimension])
    .filter(Boolean)
    .join('\n');
}

export function applyPortaTechnicalFallback(
  content: string,
  currentResolution?: PortaScoreResolution,
): PortaTechnicalFallbackResult {
  const resolution = currentResolution ?? resolvePortaScore(content);
  const fallbackDimensions = Array.from(new Set(resolution.missingDimensions));
  if (resolution.score || fallbackDimensions.length === 0) {
    return {
      content,
      resolution,
      fallbackApplied: false,
      fallbackDimensions: [],
    };
  }

  const fallbackChunk = buildPortaFallbackChunk(fallbackDimensions);
  if (!fallbackChunk) {
    return {
      content,
      resolution,
      fallbackApplied: false,
      fallbackDimensions,
    };
  }

  const nextContent = `${content.trim()}\n\n${fallbackChunk}`.trim();
  const nextResolution = resolvePortaScore(nextContent);
  return {
    content: nextContent,
    resolution: nextResolution,
    fallbackApplied: true,
    fallbackDimensions,
  };
}

export function ensureWaterfallScorePorta(
  content: string,
  currentResolution: PortaScoreResolution,
): ScorePortaData {
  if (currentResolution.score) return currentResolution.score;

  const resolvedAgain = resolvePortaScore(content);
  if (resolvedAgain.score) return resolvedAgain.score;

  const technicalFallback = applyPortaTechnicalFallback(content, resolvedAgain);
  if (technicalFallback.resolution.score) return technicalFallback.resolution.score;

  return { ...HARD_WATERFALL_SCORE_FALLBACK };
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
  accumulatedText,
  modulesByName,
  runWaterfallModule,
  optionalStepFailures,
  setFailureCount,
}: ReconcileWaterfallPortaArgs): Promise<ReconcileWaterfallPortaResult> {
  let nextAccumulatedText = accumulatedText;
  let portaFallbackApplied = false;
  let portaFallbackDimensions: PortaDimension[] = [];
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
        [
          dossierSeedContext,
          waterfallLookupContext,
          seniorEvidenceContext,
          `Contexto consolidado da rodada:\n${nextAccumulatedText.slice(-12000)}`,
          `Dimensões pendentes para emissão de markers: ${waterfallPortaResolution.missingDimensions.join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        { signal, timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS },
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

  if (shouldHoldWaterfallScoreForIntegrity(waterfallPortaResolution)) {
    portaIntegrityHold = true;
    portaFallbackApplied = true;
    portaFallbackDimensions = Array.from(new Set(waterfallPortaResolution.missingDimensions));
    scoutDiag.error('ModularDossier', 'integridade PORTA comprometida após retries e reconciliação', {
      sessionId,
      company: resolvedMegaCompany || null,
      missingDimensions: waterfallPortaResolution.missingDimensions,
    });
  } else if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
    const portaFallbackResult = applyPortaTechnicalFallback(nextAccumulatedText, waterfallPortaResolution);
    if (portaFallbackResult.fallbackApplied) {
      nextAccumulatedText = portaFallbackResult.content;
      waterfallPortaResolution = portaFallbackResult.resolution;
      portaFallbackApplied = true;
      portaFallbackDimensions = portaFallbackResult.fallbackDimensions;
      scoutDiag.warn('ModularDossier', 'fallback técnico aplicado para dimensões PORTA ausentes', {
        sessionId,
        company: resolvedMegaCompany || null,
        sourceBeforeFallback: 'feeds',
        fallbackDimensions: portaFallbackDimensions,
        resolvedAfterFallback: Boolean(waterfallPortaResolution.score),
      });
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
    portaFallbackApplied,
    portaFallbackDimensions,
    portaIntegrityHold,
  };
}
