import { callLiteLLM, LiteLLMRequestError, type LiteLLMCallResult } from './_llm-client.js';

export type DossierGatewayMode = 'generate' | 'chat';

export interface DossierGatewayInput {
  mode: DossierGatewayMode;
  userContent: string;
  dossierContext?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  correlationId: string;
  runId: string;
}

const GENERATE_SYSTEM_INSTRUCTION = [
  'Você é o motor interno de dossiês comerciais do Senior Scout 360.',
  'Use somente o contexto fornecido. Não invente fatos, fontes ou evidências.',
  'Quando faltarem dados, declare a limitação de forma explícita.',
  'Responda em português do Brasil e em Markdown.',
].join(' ');

const CHAT_SYSTEM_INSTRUCTION = [
  'Você responde perguntas sobre um dossiê comercial já existente.',
  'Use somente o contexto do dossiê e o histórico fornecidos.',
  'Não invente fatos. Se a resposta não estiver no contexto, diga que não há evidência suficiente.',
  'Responda em português do Brasil.',
].join(' ');

const DOSSIER_FUNCTION_BUDGET_MS = 50_000;

function resolveDossierGatewayTimeoutMs(): number {
  const configured = Number(process.env.LITELLM_DOSSIER_TIMEOUT_MS ?? DOSSIER_FUNCTION_BUDGET_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DOSSIER_FUNCTION_BUDGET_MS;
  return Math.min(configured, DOSSIER_FUNCTION_BUDGET_MS);
}

function resolveModel(mode: DossierGatewayMode): string {
  const generalAlias = process.env.LITELLM_DOSSIER_MODEL?.trim();
  const chatAlias = process.env.LITELLM_DOSSIER_CHAT_MODEL?.trim();
  const alias = mode === 'chat' ? chatAlias || generalAlias : generalAlias;
  if (!alias) {
    throw new LiteLLMRequestError(
      'GATEWAY_NOT_CONFIGURED',
      'LiteLLM dossier model alias is required',
      false,
    );
  }
  return alias;
}

export async function runDossierGateway(input: DossierGatewayInput): Promise<LiteLLMCallResult> {
  const context = input.dossierContext?.trim();
  const userContent = context
    ? `<contexto_dossie>\n${context}\n</contexto_dossie>\n\n<solicitacao>\n${input.userContent}\n</solicitacao>`
    : input.userContent;

  return callLiteLLM({
    model: resolveModel(input.mode),
    systemInstruction: input.mode === 'chat' ? CHAT_SYSTEM_INSTRUCTION : GENERATE_SYSTEM_INSTRUCTION,
    userContent,
    history: input.history,
    signal: input.signal,
    correlationId: input.correlationId,
    runId: input.runId,
    action: input.mode,
    temperature: input.mode === 'chat' ? 0.2 : 0.1,
    timeoutMs: resolveDossierGatewayTimeoutMs(),
    maxRetries: 0,
  });
}
