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
import type { GuardedGoldPipelineResult } from '../gold-pipeline';
import { validateGoldContract } from '../gold-contract-validator';

export interface GoldSeamInput {
  /** CNPJ normalizado (pode vir nulo quando a pesquisa não tem CNPJ). */
  cnpj: string | null | undefined;
  companyName: string;
  /** Dossiê final já pronto (waterfallFinalText) — nunca é descartado. */
  dossierText: string;
  deps: GoldSeamDeps;
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
  buildCanonical: (cnpj: string, companyName: string) => Promise<CanonicalAccount | null>;
  /** Pipeline Gold guardado (compact + compose + parse + sanitize + verifier). */
  runGold: (input: { canonical: CanonicalAccount; dossier: string }) => Promise<GuardedGoldPipelineResult>;
}

/**
 * Pós-processamento fail-closed: devolve `dossierText` intacto em qualquer
 * falha interna do Gold; devolve o Gold apenas quando elegível
 * (Verifier sem hard fails + GoldContractValidator PASS).
 */
export async function tryEnhanceDossierWithGold(input: GoldSeamInput): Promise<string> {
  const { cnpj, companyName, dossierText, deps } = input;
  if (!deps.enabled || !cnpj) return dossierText;
  try {
    const canonical = await deps.buildCanonical(cnpj, companyName);
    if (!canonical) return dossierText;

    const result = await deps.runGold({ canonical, dossier: dossierText });
    if (result.verification.hardFails.length > 0) return dossierText;

    const contract = validateGoldContract(result.goldBrief);
    if (!contract.passed) return dossierText;

    return result.goldBrief;
  } catch (error) {
    // Abort do usuário NÃO é fallback: propaga para o fluxo preservar
    // CANCELLED. Qualquer outra falha interna cai silenciosamente no dossiê.
    if (isAbortLikeError(error)) throw error;
    return dossierText;
  }
}
