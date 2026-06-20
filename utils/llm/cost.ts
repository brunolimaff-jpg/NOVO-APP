import { getModelCatalogEntry } from './modelCatalog.js';
import type { CostResult, CostUsage } from './types.js';

const CHARS_PER_TOKEN_ESTIMATE = 3.5;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

export function calculateCost(modelId: string, usage?: CostUsage, outputChars?: number): CostResult {
  const entry = getModelCatalogEntry(modelId);

  if (!entry) {
    return {
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      estimated: true,
      method: 'unknown',
      inputPriceUsed: 0,
      outputPriceUsed: 0,
    };
  }

  const inputPriceUsed = entry.inputPricePerMillion;
  const outputPriceUsed = entry.outputPricePerMillion;

  if (usage?.inputTokens !== undefined || usage?.outputTokens !== undefined) {
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const inputCostUsd = roundUsd((inputTokens / 1_000_000) * inputPriceUsed);
    const outputCostUsd = roundUsd((outputTokens / 1_000_000) * outputPriceUsed);

    return {
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
      estimated: false,
      method: 'usage',
      inputPriceUsed,
      outputPriceUsed,
    };
  }

  if (typeof outputChars === 'number' && outputChars > 0) {
    const estimatedOutputTokens = estimateTokensFromChars(outputChars);
    const outputCostUsd = roundUsd((estimatedOutputTokens / 1_000_000) * outputPriceUsed);

    return {
      inputCostUsd: 0,
      outputCostUsd,
      totalCostUsd: outputCostUsd,
      estimated: true,
      method: 'chars',
      inputPriceUsed,
      outputPriceUsed,
    };
  }

  return {
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    estimated: true,
    method: 'unknown',
    inputPriceUsed,
    outputPriceUsed,
  };
}

export function sumCosts(costs: CostResult[]): CostResult {
  if (costs.length === 0) {
    return {
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      estimated: true,
      method: 'unknown',
      inputPriceUsed: 0,
      outputPriceUsed: 0,
    };
  }

  const inputCostUsd = roundUsd(costs.reduce((sum, c) => sum + c.inputCostUsd, 0));
  const outputCostUsd = roundUsd(costs.reduce((sum, c) => sum + c.outputCostUsd, 0));
  const estimated = costs.some(c => c.estimated);

  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
    estimated,
    method: estimated ? 'chars' : 'usage',
    // An aggregate can contain different models, so no single unit price is representative.
    inputPriceUsed: 0,
    outputPriceUsed: 0,
  };
}
