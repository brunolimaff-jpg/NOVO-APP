/**
 * BRU-33 — Adapter browser-safe do seam Gold (V7 Preview Wiring).
 *
 * Implementa GoldSeamDeps usando APENAS fronteiras server-side que já existem
 * no app (nenhuma chave/segredo no cliente, nenhum provider concreto):
 * - buildCanonical: GET /api/gold-canonical (serverless) — o resolver
 *   determinístico da V6 (matriz/filial real, head office, sócios PJ com CNPJ
 *   completo, PF sem CPF) roda NO SERVIDOR; o browser não monta canonical com
 *   heurísticas ("0001 => Matriz" é falso — caso Scheffer).
 * - runGold: runGuardedGoldPipeline com compact/compose via proxyChatSendMessage
 *   (via /api/llm serverless) usando os INTENTS NEUTROS scout-gold-compact/
 *   scout-gold-compose — a política V6 (DeepSeek V3.2) resolve exclusivamente
 *   server-side em utils/llm/modelRouter.ts.
 *
 * O dossiê de entrada NÃO é reconstruído aqui: o Gold consome o dossiê que já
 * existe (princípio do Planejador — não reimplementa a pesquisa).
 * ZERO import de shadow/ no runtime (regra do Planejador).
 */
import { proxyChatSendMessage } from '../../../llmProxy';
import { isAbortLikeError } from '../../../../utils/abortHelpers';
import { GOLD_COMPACT_MODEL_ID, GOLD_COMPOSE_MODEL_ID } from '../../../../config/models';
import type { CanonicalAccount } from '../gold-contracts';
import { runGuardedGoldPipeline, type GoldPipelineDeps } from '../gold-pipeline';
import { buildCompactPrompt, buildComposePrompt, parseJsonPayload } from '../prompts/gold-contract-prompts';
import type { GoldSeamDeps } from './gold-dossier-seam';

const GOLD_CANONICAL_ENDPOINT = '/api/gold-canonical';

/** PACOTE 1 (SCOUT-V7-GOLD-BUDGET-LAYERED-01): 270s por chamada Gold no
 * browser — entre o budget server de 240s e o maxDuration do Vercel (300s). */
export const GOLD_BROWSER_CALL_BUDGET_MS = 270_000;

export interface GoldBrowserAdapterOptions {
  /** Default: env VITE_GOLD_DOSSIER_ENHANCE === '1' ou 'true' (OFF por padrão). */
  enabled?: boolean;
  /** Injeção para testes — zero chamadas provider. */
  fetchCanonical?: (cnpj: string, companyName: string, signal?: AbortSignal) => Promise<CanonicalAccount | null>;
  chatSendMessage?: typeof proxyChatSendMessage;
}

/** Busca o canonical determinístico no servidor (fallback null = fail-closed). */
export async function fetchCanonicalFromApi(
  cnpj: string,
  companyName: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CanonicalAccount | null> {
  try {
    const url = `${GOLD_CANONICAL_ENDPOINT}?cnpj=${encodeURIComponent(cnpj)}&companyName=${encodeURIComponent(companyName)}`;
    const res = await fetcher(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) return null;
    const data = (await res.json()) as CanonicalAccount;
    if (!data?.inputCnpj) return null;
    return data;
  } catch (error) {
    // Upstream indisponível → fallback silencioso (dossiê intacto). MAS abort
    // do usuário NÃO é fallback (último bloqueador BRU-33, Planejador
    // 2026-08-09): user abort durante o canonical deve PROPAGAR (CANCELLED),
    // não virar canonical_null → dossiê. TimeoutError (deadline Gold 120s)
    // não é abort-like → continua caindo em fallback.
    if (isAbortLikeError(error)) throw error;
    return null;
  }
}

export function createGoldSeamDeps(options: GoldBrowserAdapterOptions = {}): GoldSeamDeps {
  // Padrão do projeto (utils/feature-flags.ts): aceita '1' ou 'true'.
  const enabled =
    options.enabled ??
    (import.meta.env.VITE_GOLD_DOSSIER_ENHANCE === '1' || import.meta.env.VITE_GOLD_DOSSIER_ENHANCE === 'true');
  const fetchCanonical = options.fetchCanonical ?? fetchCanonicalFromApi;
  const chatSendMessage = options.chatSendMessage ?? proxyChatSendMessage;

  const pipelineDeps: GoldPipelineDeps = {
    async compact(input, signal) {
      const result = await chatSendMessage(
        {
          model: GOLD_COMPACT_MODEL_ID,
          systemInstruction:
            'Você é um extrator determinístico de fatos comerciais. Responda apenas JSON estrito, completo, sem truncar nenhum campo. Se o dossiê for longo, distribua os fatos sem omitir campos obrigatórios.',
          history: [],
          message: buildCompactPrompt(input),
          temperature: 0,
          thinkingLevel: 'low',
        },
        signal,
        // PACOTE 1 (SCOUT-V7-GOLD-BUDGET-LAYERED-01): 270s por chamada Gold
        // no browser (> 240s server, < 300s Vercel). Default 210s inalterado.
        { timeoutMs: GOLD_BROWSER_CALL_BUDGET_MS },
      );
      return parseJsonPayload(result.text);
    },
    async compose(input, signal) {
      const result = await chatSendMessage(
        {
          model: GOLD_COMPOSE_MODEL_ID,
          systemInstruction:
            'Você é um redator executivo de briefs de inteligência comercial. Escreva apenas o Gold Brief em pt-BR.',
          history: [],
          message: buildComposePrompt(input),
          temperature: 0,
          thinkingLevel: 'low',
        },
        signal,
        { timeoutMs: GOLD_BROWSER_CALL_BUDGET_MS },
      );
      return result.text;
    },
  };

  return {
    enabled,
    async buildCanonical(cnpj, companyName, signal) {
      return fetchCanonical(cnpj, companyName, signal);
    },
    async runGold(input, signal, onStage) {
      return runGuardedGoldPipeline(input, pipelineDeps, signal, onStage);
    },
  };
}
