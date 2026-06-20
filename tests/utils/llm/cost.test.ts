import { describe, expect, it } from 'vitest';
import { calculateCost, estimateTokensFromChars, sumCosts } from '../../../utils/llm/cost.js';

describe('calculateCost', () => {
  it('calcula custo real DeepSeek R1', () => {
    const result = calculateCost('huawei/deepseek-r1-250528', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(result.inputCostUsd).toBe(0.54);
    expect(result.outputCostUsd).toBe(2.16);
    expect(result.totalCostUsd).toBe(2.7);
    expect(result.estimated).toBe(false);
    expect(result.method).toBe('usage');
  });

  it('calcula custo real DeepSeek V4 Flash', () => {
    const result = calculateCost('huawei/deepseek-v4-flash', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(result.inputCostUsd).toBe(0.14);
    expect(result.outputCostUsd).toBe(0.27);
    expect(result.totalCostUsd).toBe(0.41);
  });

  it('calcula custo real Kimi K2 Thinking', () => {
    const result = calculateCost('bedrock/moonshot.kimi-k2-thinking', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(result.inputCostUsd).toBe(0.6);
    expect(result.outputCostUsd).toBe(2.5);
    expect(result.totalCostUsd).toBe(3.1);
  });

  it('R1 é mais caro que V4 Flash no output', () => {
    const r1 = calculateCost('huawei/deepseek-r1-250528', { outputTokens: 100_000 });
    const v4 = calculateCost('huawei/deepseek-v4-flash', { outputTokens: 100_000 });
    expect(r1.outputCostUsd).toBeGreaterThan(v4.outputCostUsd);
  });

  it('estima custo por chars quando não há usage', () => {
    const chars = estimateTokensFromChars(3500) * 3.5;
    const result = calculateCost('huawei/deepseek-v4-flash', undefined, chars);
    expect(result.estimated).toBe(true);
    expect(result.method).toBe('chars');
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it('modelo desconhecido retorna zeros', () => {
    const result = calculateCost('unknown/model');
    expect(result.totalCostUsd).toBe(0);
    expect(result.method).toBe('unknown');
  });

  it('soma custos de múltiplos módulos', () => {
    const moduleCosts = Array.from({ length: 5 }, () =>
      calculateCost('huawei/deepseek-v4-flash', { inputTokens: 1000, outputTokens: 2000 }),
    );
    const total = sumCosts(moduleCosts);
    expect(total.totalCostUsd).toBeGreaterThan(0);
    expect(total.inputCostUsd).toBeGreaterThan(0);
    expect(total.outputCostUsd).toBeGreaterThan(0);
  });

  it('snapshot de preço por run', () => {
    const result = calculateCost('huawei/deepseek-r1-250528', { inputTokens: 100, outputTokens: 100 });
    expect(result.inputPriceUsed).toBe(0.54);
    expect(result.outputPriceUsed).toBe(2.16);
  });

  it('estimateTokensFromChars usa 3.5 chars/token', () => {
    expect(estimateTokensFromChars(35)).toBe(10);
  });

  it('usage parcial trata tokens ausentes como zero', () => {
    const result = calculateCost('huawei/deepseek-v4-flash', { outputTokens: 1_000_000 });
    expect(result.inputCostUsd).toBe(0);
    expect(result.outputCostUsd).toBeGreaterThan(0);
  });
});
