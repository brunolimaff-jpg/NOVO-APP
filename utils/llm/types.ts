export type LLMProvider = 'gemini' | 'litellm';

export type ExperimentMode = 'off' | 'fixed' | 'random';

export type ExperimentRunStatus =
  | 'running'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'timeout'
  | 'fallback'
  | 'quality_failure'
  | 'excluded';

export interface ExperimentConfig {
  enabled: boolean;
  provider: LLMProvider;
  experimentMode: ExperimentMode;
  experimentId: string;
  defaultModel: string;
  experimentModels: string[];
  trafficSplit: number[];
  allowlist: string[];
  fallbackEnabled: boolean;
  litellmBaseUrl: string;
  previewLocalAuth: boolean;
}

export interface ExperimentSelection {
  model: string;
  variant: string;
  experimentId: string;
  provider: 'litellm';
}

export interface CostUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CostResult {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  estimated: boolean;
  method: 'usage' | 'chars' | 'unknown';
  inputPriceUsed: number;
  outputPriceUsed: number;
}

export interface NormalizeModelOutputResult {
  text: string;
  reasoningRemoved: boolean;
  reasoningCharsRemoved: number;
}

export interface LiteLLMUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface ReportQualityInput {
  text: string;
  sourcesCount?: number;
  validSourcesCount?: number;
  portaScore?: number | null;
  responseTruncated?: boolean;
  parserSuccess?: boolean;
}

export interface ReportQualityResult {
  structuralScore: number;
  isQualityFailure: boolean;
  problems: string[];
  portaMarkersValid: boolean;
  teiaComplexidadePresent: boolean;
  requiredModulesPresent: boolean;
  parserFailed: boolean;
  markdownBroken: boolean;
  responseTruncated: boolean;
}

export interface CreateRunPayload {
  experimentId: string;
  variant?: string;
  selectedModel: string;
  provider: string;
  litellmBaseUrl?: string;
  environment?: string;
  runId: string;
  sessionId?: string;
  operatorId?: string;
  operatorEmail?: string;
  companyName?: string;
  companyCnpjHash?: string;
  promptVersion: string;
  codeVersion: string;
}

export interface FinalizeRunPayload {
  id: string;
  runToken: string;
  status: ExperimentRunStatus;
  operatorEmail?: string;
  exclusionReason?: string;
  fallbackUsed?: boolean;
  fallbackModel?: string;
  retryCount?: number;
  totalLatencyMs?: number;
  modelLatencyMs?: number;
  waterfallDurationMs?: number;
  modulesGenerated?: number;
  modulesRequiredPresent?: number;
  modulesMissing?: string[];
  reportChars?: number;
  reportTokensEstimated?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputCostUsd?: number;
  outputCostUsd?: number;
  totalCostUsd?: number;
  estimatedCost?: boolean;
  costEstimationMethod?: string;
  inputPriceUsed?: number;
  outputPriceUsed?: number;
  sourcesCount?: number;
  validSourcesCount?: number;
  removedSourcesCount?: number;
  portaScorePresent?: boolean;
  portaMarkersValid?: boolean;
  portaScore?: number;
  teiaComplexidadePresent?: boolean;
  teiaComplexidade?: string;
  parserSuccess?: boolean;
  renderSuccess?: boolean;
  promptLeakDetected?: boolean;
  responseEmpty?: boolean;
  responseTruncated?: boolean;
  markdownBroken?: boolean;
  structuralScore?: number;
  errorNormalized?: string;
}

export interface ModelCatalogEntry {
  id: string;
  variant: string;
  displayName: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  reasoning: boolean;
}
