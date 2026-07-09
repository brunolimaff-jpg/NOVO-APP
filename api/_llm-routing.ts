import { HYBRID_MODEL_MAP, selectModelForModule } from '../utils/llm/modelRouter.js';

export type LlmRouteProvider = 'gemini' | 'litellm';
export type LlmRouteReason = 'foundation_cache' | 'grounding_required' | 'litellm_disabled' | 'litellm_enabled';

export interface LlmRouteDecision {
  provider: LlmRouteProvider;
  reason: LlmRouteReason;
  model: string;
  module: string | null;
}

export interface GenerateContentRoutingInput {
  liteLlmEnabled: boolean;
  requestedModel: string;
  moduleName: string | null;
  hasCachedContent: boolean;
  hasSystemInstruction: boolean;
  hasGrounding: boolean;
}

const SAFE_TELEMETRY_MODEL_IDS = new Set([
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-embedding-001',
  ...Object.values(HYBRID_MODEL_MAP),
]);

function getKnownModuleName(moduleName: string | null): string | null {
  return moduleName && Object.hasOwn(HYBRID_MODEL_MAP, moduleName) ? moduleName : null;
}

function getSafeModelId(model: string): string | null {
  return SAFE_TELEMETRY_MODEL_IDS.has(model) ? model : null;
}

export function selectGenerateContentRoute(input: GenerateContentRoutingInput): LlmRouteDecision {
  const module = getKnownModuleName(input.moduleName);
  const usesGeminiFoundationCache = input.hasCachedContent && !input.hasSystemInstruction;

  if (input.liteLlmEnabled && !usesGeminiFoundationCache && !input.hasGrounding) {
    return {
      provider: 'litellm',
      reason: 'litellm_enabled',
      model: selectModelForModule(input.moduleName ?? ''),
      module,
    };
  }

  return {
    provider: 'gemini',
    reason: usesGeminiFoundationCache ? 'foundation_cache' : input.hasGrounding ? 'grounding_required' : 'litellm_disabled',
    model: input.requestedModel,
    module,
  };
}

function logRoute(event: 'provider:selected' | 'provider:completed' | 'provider:failed', route: LlmRouteDecision, durationMs?: number) {
  console.warn('[LlmRoute]', {
    event,
    provider: route.provider,
    reason: route.reason,
    model: getSafeModelId(route.model),
    module: getKnownModuleName(route.module),
    ...(durationMs === undefined ? {} : { durationMs }),
  });
}

export async function executeLlmRoute<T>(route: LlmRouteDecision, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  logRoute('provider:selected', route);

  try {
    const result = await operation();
    logRoute('provider:completed', route, Date.now() - startedAt);
    return result;
  } catch (error) {
    logRoute('provider:failed', route, Date.now() - startedAt);
    throw error;
  }
}
