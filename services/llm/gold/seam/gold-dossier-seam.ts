/**
 * BRU-33 — Seam Gold pós-processamento fail-closed (V7 Preview Wiring).
 *
 * Integra o pipeline Gold ao final do dossiê real SEM reexecutar pesquisa:
 * dossiê pronto → tenta Gold (upstream + compact + compose V3.2)
 * → Verifier + GoldContractValidator → PASS: devolve o Gold;
 * qualquer falha INTERNA (erro, parse, timeout, verifier/contract FAIL):
 * devolve o dossiê original intacto.
 *
 * Regras congeladas pelo Planejador (2026-08-08):
 * - flag OFF por padrão (produção inalterada);
 * - abort do usuário NÃO é fallback — propaga (preserva CANCELLED no fluxo);
 * - erros de run-control/lease NÃO são fallback — o chamador preserva FAILED
 *   via assertRunCanContinue (o seam não engole nenhum controle de run);
 * - REAL_PROVIDER_CALLS_IN_TESTS = 0: os deps são injetados (mocks nos testes).
 */
import { isAbortLikeError } from '../../../../utils/abortHelpers';
import type { CanonicalAccount } from '../gold-contracts';
import type { GoldStageHandler } from '../gold-pipeline';
import type { GuardedGoldPipelineResult } from '../gold-pipeline';
import { validateGoldContract } from '../gold-contract-validator';

/**
 * BRU-33 — Razão REAL da rejeição quando o seam devolve o dossiê sem exceção.
 * Substitui o reason enganoso "verifier_ou_contract_fail" (que rotulava também
 * canonical null como se fosse falha de verificação).
 */
export type GoldRejectionReason = 'canonical_null' | 'verifier_fail' | 'contract_fail';

export interface GoldSeamInput {
  /** CNPJ normalizado (pode vir nulo quando a pesquisa não tem CNPJ). */
  cnpj: string | null | undefined;
  companyName: string;
  /** Dossiê final já pronto (waterfallFinalText) — nunca é descartado. */
  dossierText: string;
  deps: GoldSeamDeps;
  /**
   * AbortSignal do fluxo (usuário/run-control): abort do usuário NÃO é
   * fallback — propaga (CANCELLED). O deadline total de 270s usa um
   * AbortSignal.timeout combinado; TimeoutError cai em fallback silencioso.
   */
  signal?: AbortSignal;
  /** Telemetria por etapa — apenas métricas, nunca conteúdo (sem dados sensíveis). */
  onStage?: GoldStageHandler;
  /** Razão real quando o seam devolve o dossiê SEM exceção (veredito do Planejador). */
  onRejected?: (reason: GoldRejectionReason) => void;
}

export interface GoldSeamDeps {
  /** Feature flag (OFF por padrão). */
  enabled: boolean;
  /**
   * Constrói o canonical cadastral a partir do CNPJ. Retorna null quando o
   * upstream não está disponível (sem CNPJ válido, falha de cadastro) →
   * fallback silencioso. O dossier de entrada NÃO é reconstruído aqui: o
   * Gold consome o dossiê que já existe (princípio do Planejador).
   */
  buildCanonical: (cnpj: string, companyName: string, signal?: AbortSignal) => Promise<CanonicalAccount | null>;
  /** Pipeline Gold guardado (compact + compose + parse + sanitize + verifier). */
  runGold: (
    input: { canonical: CanonicalAccount; dossier: string },
    signal?: AbortSignal,
    onStage?: GoldStageHandler,
  ) => Promise<GuardedGoldPipelineResult>;
}

/**
 * Deadline total do pós-processamento Gold. SCOUT-V7-GOLD-DEADLINE-180
 * (Planejador 2026-08-09) mostrou-se NEUTRO na causa raiz real: o teto do
 * gateway (/api/llm MAX_REQUEST_BUDGET_MS) também era 180s e cortava o
 * compact lento (>180s) ANTES do deadline Gold. Reconciliado com o
 * maxDuration do Vercel (300s) e com o orçamento por etapa (lição
 * pipeline-server-side-isolado-deve-explicitar-orcamento):
 * compact até ~230s + compose ~40s = ~270s; hierarquia: GOLD_DEADLINE 270s
 * < gateway por chamada 280s < llmProxy 290s < maxDuration 300s.
 * TimeoutError → fallback; abort → propaga.
 */
export const GOLD_DEADLINE_MS = 270_000;

/**
 * Pós-processamento fail-closed: devolve `dossierText` intacto em qualquer
 * falha interna do Gold (incluindo TimeoutError do deadline de 270s);
 * devolve o Gold apenas quando elegível (Verifier sem hard fails +
 * GoldContractValidator PASS). Abort do usuário NÃO é fallback — propaga.
 */
export async function tryEnhanceDossierWithGold(input: GoldSeamInput): Promise<string> {
  const { cnpj, companyName, dossierText, deps, signal, onStage, onRejected } = input;
  if (!deps.enabled || !cnpj) return dossierText;
  // Deadline total: combina o signal do usuário com um timeout de 270s.
  // TimeoutError → fallback; AbortError (usuário) → propaga.
  const goldSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(GOLD_DEADLINE_MS)])
    : AbortSignal.timeout(GOLD_DEADLINE_MS);
  try {
    const canonical = await deps.buildCanonical(cnpj, companyName, goldSignal);
    if (!canonical) {
      onStage?.('canonical-done', { resolved: false });
      onRejected?.('canonical_null');
      return dossierText;
    }
    onStage?.('canonical-done', { resolved: true });

    const result = await deps.runGold({ canonical, dossier: dossierText }, goldSignal, onStage);
    if (result.verification.hardFails.length > 0) {
      onRejected?.('verifier_fail');
      return dossierText;
    }

    const contract = validateGoldContract(result.goldBrief);
    onStage?.('contract-done', { passed: contract.passed });
    if (!contract.passed) {
      onRejected?.('contract_fail');
      return dossierText;
    }

    return result.goldBrief;
  } catch (error) {
    // Abort do usuário NÃO é fallback: propaga para o fluxo preservar
    // CANCELLED. Qualquer outra falha interna (incl. TimeoutError do
    // deadline) cai silenciosamente no dossiê.
    if (isAbortLikeError(error)) throw error;
    return dossierText;
  }
}
