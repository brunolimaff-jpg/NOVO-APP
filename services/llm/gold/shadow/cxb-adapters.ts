/**
 * V6 — Shadow CxB: adapters reais de compactor/composer.
 *
 * Implementam GoldPipelineDeps chamando o gateway LiteLLM (Bedrock) com os
 * modelos do braço. Cada chamada registra tokens, tempo e custo no
 * ShadowStep — observabilidade da Fase 2B.
 *
 * A chave é lida do Keychain (macOS) ou LITELLM_API_KEY do ambiente —
 * nunca hard-coded, nunca em logs.
 */
import { execFileSync } from 'node:child_process';
import { callLiteLLM } from '../../../../api/_llm-client.js';
import type { CompactInput, ComposeInput, GoldPipelineDeps } from '../gold-pipeline.js';
import type { RawFindingPack } from '../gold-contracts.js';
import type { CxBArm } from './cxb-arms.js';
// Prompts do contrato compartilhados com o seam de produção (browser-safe).
import { buildCompactPrompt, buildComposePrompt, parseJsonPayload } from '../prompts/gold-contract-prompts.js';

export interface ShadowStepMetrics {
  step: 'compact' | 'compose';
  modelId: string;
  attempt: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  status: 'ok' | 'timeout' | 'error';
  errorCode?: string;
}

export interface CxbAdapters extends GoldPipelineDeps {
  arm: CxBArm;
  /** Últimas métricas por step (para o ShadowRun). */
  lastMetrics: { compact?: ShadowStepMetrics; compose?: ShadowStepMetrics };
}

function resolveApiKey(): string {
  const fromEnv = process.env.LITELLM_API_KEY;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'novo-app-litellm', '-w'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  } catch {
    throw new Error('LITELLM_API_KEY ausente: defina no ambiente ou no Keychain (service novo-app-litellm)');
  }
}

function estimateCostUsd(inputTokens: number, outputTokens: number, pricePerM: { input: number; output: number }): number {
  return (inputTokens / 1_000_000) * pricePerM.input + (outputTokens / 1_000_000) * pricePerM.output;
}

function makeStep(
  step: 'compact' | 'compose',
  modelId: string,
  usage: { prompt_tokens?: number; completion_tokens?: number },
  latencyMs: number,
  pricePerM: { input: number; output: number },
): ShadowStepMetrics {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  return {
    step,
    modelId,
    attempt: 1,
    inputTokens,
    outputTokens,
    latencyMs,
    costUsd: estimateCostUsd(inputTokens, outputTokens, pricePerM),
    status: 'ok',
  };
}

export function createCxbAdapters(arm: CxBArm): CxbAdapters {
  const apiKey = resolveApiKey();
  const lastMetrics: CxbAdapters['lastMetrics'] = {};

  async function compact(input: CompactInput): Promise<RawFindingPack> {
    const startedAt = Date.now();
    let lastError: Error | undefined;
    // O DeepSeek pode truncar/errar campos em dossiês longos — retry com
    // re-prompt (mesma chamada lógica, attempt incrementado).
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await callLiteLLM(
          {
            model: arm.compactorModel,
            systemInstruction:
              'Você é um extrator determinístico de fatos comerciais. Responda apenas JSON estrito, completo, sem truncar nenhum campo. Se o dossiê for longo, distribua os fatos sem omitir campos obrigatórios.',
            userContent: buildCompactPrompt(input),
            temperature: 0,
            maxOutputTokens: 16_384,
            timeoutMs: 170_000,
            maxRetries: 1,
            action: 'gold-shadow-compact',
          },
          { ...process.env, LITELLM_API_KEY: apiKey },
        );
        const latencyMs = Date.now() - startedAt;
        const parsed = parseJsonPayload(result.text);
        lastMetrics.compact = makeStep(
          'compact',
          arm.compactorModel,
          { prompt_tokens: result.usage.promptTokenCount ?? 0, completion_tokens: result.usage.candidatesTokenCount ?? 0 },
          latencyMs,
          { input: arm.refPricePerM.input, output: arm.refPricePerM.output },
        );
        lastMetrics.compact.attempt = attempt;
        return parsed;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < 3) {
          console.warn(`[compact] tentativa ${attempt} falhou (${lastError.message.slice(0, 120)}) — retry ${attempt + 1}`);
        }
      }
    }
    lastMetrics.compact = {
      step: 'compact',
      modelId: arm.compactorModel,
      attempt: 3,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      costUsd: 0,
      status: 'error',
      errorCode: lastError?.message.slice(0, 200) ?? 'unknown',
    };
    throw lastError ?? new Error('compact falhou após 3 tentativas');
  }

  async function compose(input: ComposeInput): Promise<string> {
    const startedAt = Date.now();
    const prompt = buildComposePrompt(input);

    try {
        const result = await callLiteLLM(
          {
            model: arm.composerModel,
            systemInstruction: 'Você é um redator executivo de briefs de inteligência comercial. Escreva apenas o Gold Brief em pt-BR.',
            userContent: prompt,
            temperature: 0,
            maxOutputTokens: 16_384,
            timeoutMs: 170_000, // Opus pode demorar em dossiês longos
            maxRetries: 1,
            action: 'gold-shadow-compose',
          },
          { ...process.env, LITELLM_API_KEY: apiKey },
        );
      const latencyMs = Date.now() - startedAt;
      lastMetrics.compose = makeStep(
        'compose',
        arm.composerModel,
        { prompt_tokens: result.usage.promptTokenCount ?? 0, completion_tokens: result.usage.candidatesTokenCount ?? 0 },
        latencyMs,
        { input: arm.refPricePerM.input, output: arm.refPricePerM.output },
      );
      return result.text;
    } catch (e) {
      lastMetrics.compose = {
        step: 'compose',
        modelId: arm.composerModel,
        attempt: 1,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costUsd: 0,
        status: 'error',
        errorCode: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
      };
      throw e;
    }
  }

  return { arm, compact, compose, lastMetrics };
}
