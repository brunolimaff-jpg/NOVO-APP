/**
 * Endpoint LLM unificado do Senior Scout 360 — LiteLLM primário + OpenCode Zen
 * como fallback automático (Fallback V1) ou modo forçado (LLM_PROVIDER=zen).
 *
 * Única rota de geração e chat do app. Todo roteamento de provedor e modelo
 * concreto acontece no servidor (utils/llm/modelRouter.ts); o cliente envia
 * apenas intenções neutras (scout-router / scout-tactical / scout-deep-chat /
 * scout-deep-research). IDs de modelo concretos enviados pelo cliente são
 * ignorados.
 *
 * Contrato de erro de geração/chat (nunca corpo vazio):
 *   { text: "", error: { code, message, retryable } }
 * Retry seletivo do primário: apenas 408/429/5xx (interno ao callLiteLLM).
 * Fallback para Zen: apenas falhas elegíveis da allowlist (callLLM).
 *
 * `recordDiagnostics` permanece nesta rota (telemetria) e responde antes de
 * qualquer validação de LLM, inclusive com o gateway desabilitado.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { insertDiagnosticsBatch, MAX_EVENTS_PER_BATCH } from '../utils/serverDiagnostics.js';
import { applyCors } from './_cors-headers.js';
import {
  callLLM,
  isFallbackEnabled,
  isLiteLLMEnabled,
  isZenConfigured,
  isZenEnabled,
  LiteLLMRequestError,
  type LiteLLMCallInput,
} from './_llm-client.js';
import { resolveIntentModel, selectModelForModule } from '../utils/llm/modelRouter.js';

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string(),
});
const ThinkingLevelSchema = z.enum(['low', 'medium', 'high']);

const LlmRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generateContent'),
    model: z.string().min(1).max(200).optional(),
    contents: z.unknown(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('chatSendMessage'),
    model: z.string().min(1).max(200).optional(),
    systemInstruction: z.string().max(100000).optional(),
    history: z.array(HistoryItemSchema).optional(),
    message: z.string().min(1).max(200000),
    thinkingLevel: ThinkingLevelSchema.optional(),
    thinkingMode: z.boolean().optional(),
    temperature: z.number().optional(),
  }),
]);

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 300;

const CHAT_DEFAULT_MAX_OUTPUT_TOKENS = 65_536;
const LLM_BUDGET_EXCEEDED_MESSAGE = 'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.';
const INTERNAL_MARKER_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/gi;
const INTERNAL_MARKER_OPEN_TAIL_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*$/i;
const HARD_PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/i,
  /investigacao_completa_integrada/i,
  /protocolo de investiga[çc][aã]o forense/i,
  /urgente:\s*ignore\s+metadiscuss[õo]es/i,
  /sua miss[aã]o absoluta/i,
  /n[aã]o discuta o funcionamento interno do modelo/i,
];
const SOFT_PROMPT_LEAK_PATTERNS: RegExp[] = [
  /urgente:.*dossi[eê]\s+de\s+agroneg[oó]cio/i,
  /score porta.*preciso.*cnpj/i,
  /execute um dossi[eê] completo combinando os protocolos/i,
  /priorize objetividade.*fontes audit[aá]veis/i,
];

function stripInternalMarkersLocal(text: string): string {
  return (text || '')
    .replace(INTERNAL_MARKER_REGEX, '')
    .replace(INTERNAL_MARKER_OPEN_TAIL_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\]\s*$/gm, '')
    .trim();
}

function detectPromptLeakIndicatorsLocal(text: string): { detected: boolean; indicators: string[] } {
  const sample = (text || '').trim();
  if (!sample) return { detected: false, indicators: [] };

  const hardHits = HARD_PROMPT_LEAK_PATTERNS.flatMap((pattern, i) => (pattern.test(sample) ? [`hard_${i}`] : []));
  const softHits = SOFT_PROMPT_LEAK_PATTERNS.flatMap((pattern, i) => (pattern.test(sample) ? [`soft_${i}`] : []));
  return {
    detected: hardHits.length > 0 || softHits.length >= 2,
    indicators: [...hardHits, ...softHits],
  };
}

function applyPromptLeakShieldLocal(text: string): {
  text: string;
  blocked: boolean;
  indicators: string[];
} {
  const cleaned = stripInternalMarkersLocal(text || '');
  const sample = cleaned || (text || '').trim();
  const detection = detectPromptLeakIndicatorsLocal(sample);

  if (!detection.detected) {
    return { text: sample, blocked: false, indicators: [] };
  }

  return {
    text: 'Para continuar com segurança na análise, confirme o CNPJ da empresa (14 dígitos).',
    blocked: true,
    indicators: detection.indicators,
  };
}

const getEnvVar = (name: string): string | undefined => {
  try {
    return typeof process !== 'undefined' ? process.env[name] : undefined;
  } catch {
    return undefined;
  }
};

type ParsedBody = z.infer<typeof LlmRequestSchema>;
type ThinkingLevelInput = z.infer<typeof ThinkingLevelSchema>;

function resolveThinkingLevel(thinkingLevel?: ThinkingLevelInput, thinkingMode?: boolean): ThinkingLevelInput {
  if (thinkingLevel) return thinkingLevel;
  if (thinkingMode === true) return 'high';
  if (thinkingMode === false) return 'low';
  return 'high';
}

function temperatureForThinking(level: ThinkingLevelInput): number {
  if (level === 'high') return 0.1;
  if (level === 'medium') return 0.15;
  return 0.25;
}

function flattenContents(contents: unknown): string {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) {
    return contents
      .map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
          const record = c as Record<string, unknown>;
          if (typeof record.text === 'string') return record.text;
          if (Array.isArray(record.parts)) {
            return record.parts
              .map(p => (p && typeof p === 'object' && typeof (p as Record<string, unknown>).text === 'string'
                ? (p as Record<string, unknown>).text
                : ''))
              .filter(Boolean)
              .join('\n');
          }
        }
        return JSON.stringify(c);
      })
      .join('\n');
  }
  return JSON.stringify(contents);
}

function errorPayload(code: string, message: string, retryable: boolean) {
  return { text: '', error: { code, message, retryable } };
}

function httpStatusForError(error: unknown): { status: number; code: string; retryable: boolean; message: string } {
  if (error instanceof LiteLLMRequestError) {
    switch (error.code) {
      case 'GATEWAY_NOT_CONFIGURED':
        return { status: 503, code: 'LLM_GATEWAY_DISABLED', retryable: false, message: error.message };
      case 'GATEWAY_TIMEOUT':
        return { status: 504, code: 'LLM_GATEWAY_TIMEOUT', retryable: true, message: error.message };
      case 'GATEWAY_ABORTED':
        return { status: 408, code: 'LLM_REQUEST_ABORTED', retryable: false, message: error.message };
      case 'GATEWAY_BUDGET_EXCEEDED':
        return { status: 429, code: 'LLM_BUDGET_EXCEEDED', retryable: false, message: LLM_BUDGET_EXCEEDED_MESSAGE };
      case 'GATEWAY_INVALID_RESPONSE':
        return { status: 502, code: 'LLM_INVALID_RESPONSE', retryable: false, message: error.message };
      case 'GATEWAY_HTTP_ERROR':
        return {
          status: error.status ?? 502,
          code: 'LLM_GATEWAY_HTTP',
          retryable: error.retryable,
          message: error.message,
        };
    }
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { status: 500, code: 'LLM_CALL_FAILED', retryable: false, message };
}

function toLlmHistory(
  history: Array<{ role: 'user' | 'model'; text: string }> | undefined,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!history) return [];
  return history
    .map(item => ({
      role: item.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: item.text,
    }))
    .filter(msg => msg.content.trim().length > 0);
}

async function executeGenerateContent(
  body: Extract<ParsedBody, { action: 'generateContent' }>,
  res: VercelResponse,
): Promise<VercelResponse> {
  const contents = body.contents;
  const cfg = (body.config ?? {}) as Record<string, unknown>;

  // Extrai nome do módulo das contents para roteamento server-side
  const contentsStr =
    typeof contents === 'string'
      ? contents
      : Array.isArray(contents)
        ? (contents as Array<{ text?: string }>).map(c => c?.text || '').join(' ')
        : '';
  const srvModuleMatch = contentsStr.match(/bloco de (.+?) com extrema/i);
  const srvModuleName = srvModuleMatch?.[1]?.trim() || null;

  // O modelo concreto é sempre resolvido no servidor; o valor enviado pelo
  // cliente é ignorado (intenções neutras não chegam a gerar conteúdo).
  const resolvedModel = selectModelForModule(srvModuleName || '');

  if (!contents) {
    return res.status(400).json({ error: 'Invalid request', details: { contents: 'required' } });
  }

  const srvRunId = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (srvModuleName) {
    void insertDiagnosticsBatch({ runId: srvRunId, route: '/api/llm', events: [] }, [
      {
        at: new Date().toISOString(),
        t: Date.now(),
        runId: srvRunId,
        area: 'ServerWaterfall',
        event: 'module:start',
        severity: 'info',
        payload: { module: srvModuleName, model: resolvedModel },
      },
    ]);
  }

  try {
    const input: LiteLLMCallInput = {
      model: resolvedModel,
      systemInstruction: typeof cfg.systemInstruction === 'string' ? cfg.systemInstruction : undefined,
      userContent: flattenContents(contents),
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.2,
      maxOutputTokens: typeof cfg.maxOutputTokens === 'number' ? cfg.maxOutputTokens : 8192,
      runId: srvRunId,
      action: 'generateContent',
      correlationId: srvRunId,
    };
    const result = await callLLM(input);

    if (srvModuleName) {
      void insertDiagnosticsBatch({ runId: srvRunId, route: '/api/llm', events: [] }, [
        {
          at: new Date().toISOString(),
          t: Date.now(),
          runId: srvRunId,
          area: 'ServerWaterfall',
          event: 'module:end',
          severity: 'info',
          payload: {
            module: srvModuleName,
            model: resolvedModel,
            provider: result.provider,
            served_model: result.servedModel,
            fallback_used: result.fallbackUsed,
            fallback_reason: result.fallbackReason,
          },
        },
      ]);
    }

    return res.status(200).json({
      text: result.text,
      _model: result.servedModel,
      usage: result.usage,
      finishReason: result.finishReason,
    });
  } catch (error) {
    const mapped = httpStatusForError(error);
    console.error('[LlmProxy] generateContent failed:', mapped.message, {
      status: mapped.status,
      gatewayBody: error instanceof LiteLLMRequestError ? error.gatewayBody?.slice(0, 1000) : undefined,
    });
    if (srvModuleName) {
      void insertDiagnosticsBatch({ runId: srvRunId, route: '/api/llm', events: [] }, [
        {
          at: new Date().toISOString(),
          t: Date.now(),
          runId: srvRunId,
          area: 'ServerWaterfall',
          event: 'module:fail',
          severity: 'error',
          payload: {
            module: srvModuleName,
            model: resolvedModel,
            status: mapped.status,
            code: mapped.code,
            upstream_error_code: error instanceof LiteLLMRequestError ? error.code : undefined,
            upstream_retryable: error instanceof LiteLLMRequestError ? error.retryable : undefined,
            retry_after: error instanceof LiteLLMRequestError ? error.retryAfter : undefined,
            request_id: error instanceof LiteLLMRequestError ? error.requestId : undefined,
          },
        },
      ]);
    }
    return res.status(mapped.status).json(errorPayload(mapped.code, mapped.message, mapped.retryable));
  }
}

async function executeChatSendMessage(
  body: Extract<ParsedBody, { action: 'chatSendMessage' }>,
  res: VercelResponse,
): Promise<VercelResponse> {
  const resolvedModel = resolveIntentModel(body.model);
  const resolvedThinkingLevel = resolveThinkingLevel(body.thinkingLevel, body.thinkingMode);
  const correlationId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const input: LiteLLMCallInput = {
      model: resolvedModel,
      systemInstruction: body.systemInstruction || undefined,
      history: toLlmHistory(body.history),
      userContent: body.message,
      temperature: typeof body.temperature === 'number' ? body.temperature : temperatureForThinking(resolvedThinkingLevel),
      maxOutputTokens: CHAT_DEFAULT_MAX_OUTPUT_TOKENS,
      runId: correlationId,
      action: 'chatSendMessage',
      correlationId,
    };
    const result = await callLLM(input);

    const leakShieldResult = applyPromptLeakShieldLocal(result.text);
    if (leakShieldResult.blocked) {
      console.warn('[PromptLeakShield][api/llm] resposta bloqueada', {
        action: body.action,
        model: resolvedModel,
        indicators: leakShieldResult.indicators,
      });
    }
    if (result.fallbackUsed) {
      console.warn('[LlmProxy] fallback de provider usado', {
        action: body.action,
        provider: result.provider,
        servedModel: result.servedModel,
        fallbackReason: result.fallbackReason,
      });
    }

    return res.status(200).json({
      text: leakShieldResult.text,
      _model: result.servedModel,
      usage: result.usage,
      finishReason: result.finishReason,
    });
  } catch (error) {
    const mapped = httpStatusForError(error);
    console.error('[LlmProxy] chatSendMessage failed:', mapped.message, {
      status: mapped.status,
      gatewayBody: error instanceof LiteLLMRequestError ? error.gatewayBody?.slice(0, 1000) : undefined,
    });
    return res.status(mapped.status).json(errorPayload(mapped.code, mapped.message, mapped.retryable));
  }
}

async function executeLlmAction(body: ParsedBody, res: VercelResponse): Promise<VercelResponse> {
  switch (body.action) {
    case 'generateContent':
      return executeGenerateContent(body, res);
    case 'chatSendMessage':
      return executeChatSendMessage(body, res);
    default:
      return res.status(400).json({ error: 'Unsupported action' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── recordDiagnostics: early return antes de qualquer validação de LLM ──
  if (req.body?.action === 'recordDiagnostics') {
    const body = req.body as {
      runId?: string;
      sessionId?: string;
      operatorId?: string;
      environment?: string;
      appVersion?: string;
      route?: string;
      userAgent?: string;
      events?: unknown[];
    };

    if (!body.runId || !Array.isArray(body.events) || body.events.length === 0) {
      return res.status(400).json({ error: 'Missing runId or events' });
    }

    const events = body.events.slice(0, MAX_EVENTS_PER_BATCH) as unknown as Parameters<
      typeof insertDiagnosticsBatch
    >[1];

    const result = await insertDiagnosticsBatch(
      {
        runId: body.runId,
        sessionId: body.sessionId,
        operatorId: body.operatorId,
        environment: body.environment,
        appVersion: body.appVersion,
        route: body.route,
        userAgent: body.userAgent,
        events,
      },
      events,
    );

    if (result.error && result.error === 'Supabase not configured') {
      return res.status(200).json({ inserted: 0, degraded: true, reason: result.error });
    }

    return res.status(result.error ? 500 : 200).json(result);
  }

  const parsed = LlmRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  // Gate do Fallback V1: LiteLLM é o primário; OpenCode Zen é o secundário
  // automático (LLM_FALLBACK_ENABLED=true + configurado) ou o modo forçado
  // (LLM_PROVIDER=zen). Sem gateway disponível, falha controlada e explícita —
  // nunca fallback silencioso para um terceiro caminho.
  const gatewayAvailable =
    isLiteLLMEnabled() ||
    isZenEnabled() ||
    (isFallbackEnabled() && isZenConfigured());
  if (!gatewayAvailable) {
    return res
      .status(503)
      .json(
        errorPayload(
          'LLM_GATEWAY_DISABLED',
          'Gateway LLM não configurado (LLM_PROVIDER=litellm + LITELLM_BASE_URL + LITELLM_API_KEY; LLM_PROVIDER=zen + OPENCODE_ZEN_*; ou LLM_FALLBACK_ENABLED=true + OPENCODE_ZEN_*)',
          false,
        ),
      );
  }

  try {
    return await executeLlmAction(parsed.data, res);
  } catch (error) {
    const mapped = httpStatusForError(error);
    console.error('LLM proxy error:', mapped.message);
    return res.status(mapped.status).json(errorPayload(mapped.code, mapped.message, mapped.retryable));
  }
}
