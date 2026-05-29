import { STABLE_RESEARCH_MODEL_ID } from './config';
import { proxyCreateCachedContent, proxyDeleteCachedContent } from '../geminiProxy';
import { scoutDiag } from '../../utils/diagnosticLog';

export const WATERFALL_FOUNDATION_CACHE_TTL = '600s';

export const WATERFALL_FOUNDATION_CACHE_TOOLS = [{ googleSearch: {} }] as const;

export interface StaticDossierContextInput {
  dossierSeedContext: string;
  waterfallLookupContext: string;
  seniorEvidenceContext: string;
  teiaResearchText: string;
}

export function isFoundationCacheEnabled(): boolean {
  return import.meta.env.VITE_GEMINI_FOUNDATION_CACHE_ENABLED === '1';
}

export function buildStaticDossierContext(input: StaticDossierContextInput): string {
  return [input.dossierSeedContext, input.waterfallLookupContext, input.seniorEvidenceContext, input.teiaResearchText]
    .filter(Boolean)
    .join('\n\n');
}

export function buildCachedSystemInstruction(foundationBlock: string, staticContext: string): string {
  if (!staticContext.trim()) return foundationBlock;
  return `${foundationBlock}\n\n${staticContext}`;
}

export function joinDossierExtraContext(staticContext: string, dynamicContext: string): string {
  return [staticContext, dynamicContext].filter(Boolean).join('\n\n');
}

export function buildDynamicDossierContext(
  contextHint: string,
  accumulatedTextSnapshot: string,
  windowChars: number,
): string {
  return [
    contextHint ? `Objetivo desta passada:\n${contextHint}` : '',
    accumulatedTextSnapshot ? `Contexto anterior consolidado:\n${accumulatedTextSnapshot.slice(-windowChars)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function createWaterfallFoundationCache(args: {
  foundationBlock: string;
  staticContext: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const systemInstruction = buildCachedSystemInstruction(args.foundationBlock, args.staticContext);

  scoutDiag.info?.('FoundationCache', 'criando cache explicito do waterfall', {
    foundationChars: args.foundationBlock.length,
    staticContextChars: args.staticContext.length,
    systemInstructionChars: systemInstruction.length,
    ttl: WATERFALL_FOUNDATION_CACHE_TTL,
  });

  const response = await proxyCreateCachedContent(
    {
      model: args.model ?? STABLE_RESEARCH_MODEL_ID,
      systemInstruction,
      ttl: WATERFALL_FOUNDATION_CACHE_TTL,
      displayName: 'scout360-waterfall-foundation',
      tools: [...WATERFALL_FOUNDATION_CACHE_TOOLS],
    },
    args.signal,
  );

  if (!response.name) {
    throw new Error('Foundation cache create did not return a cache name');
  }

  scoutDiag.info?.('FoundationCache', 'cache criado', {
    name: response.name,
    expireTime: response.expireTime,
    usageMetadata: response.usageMetadata,
  });

  return response.name;
}

export async function deleteWaterfallFoundationCache(
  cacheName: string | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (!cacheName) return;

  try {
    await proxyDeleteCachedContent({ name: cacheName }, signal);
    scoutDiag.info?.('FoundationCache', 'cache removido', { name: cacheName });
  } catch (error) {
    scoutDiag.warn('FoundationCache', 'falha ao remover cache (TTL expira automaticamente)', {
      name: cacheName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
