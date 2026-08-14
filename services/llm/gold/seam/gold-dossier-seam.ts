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
import type { ScoutSegment } from '../../query-planner';
import type { GoldStageHandler } from '../gold-pipeline';
import type { GuardedGoldPipelineResult } from '../gold-pipeline';
import { validateGoldContract } from '../gold-contract-validator';

/**
 * BRU-33 — Razão REAL da rejeição quando o seam devolve o dossiê sem exceção.
 * Substitui o reason enganoso "verifier_ou_contract_fail" (que rotulava também
 * canonical null como se fosse falha de verificação).
 */
export type GoldRejectionReason = 'canonical_null' | 'verifier_fail' | 'contract_fail';

export interface GoldRejectionDetail {
  hardFails?: number;
  codes?: string[];
  codeCounts?: Record<string, number>;
}

export interface GoldSeamInput {
  /** CNPJ normalizado (pode vir nulo quando a pesquisa não tem CNPJ). */
  cnpj: string | null | undefined;
  companyName: string;
  /** Dossiê final já pronto (waterfallFinalText) — nunca é descartado. */
  dossierText: string;
  /** Segmento operacional do planner, quando disponível. */
  segment?: ScoutSegment;
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
  onRejected?: (reason: GoldRejectionReason, detail?: GoldRejectionDetail) => void;
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
    input: { canonical: CanonicalAccount; dossier: string; segment?: ScoutSegment },
    signal?: AbortSignal,
    onStage?: GoldStageHandler,
  ) => Promise<GuardedGoldPipelineResult>;
}

/** BRU-69 — tipo de saída final selecionada pelo seam (telemetria obrigatória). */
export type GoldOutputKind = 'gold_pass' | 'factual_minimal' | 'controlled_unavailable';

export interface GoldOutputSelection {
  kind: GoldOutputKind;
  reason?: GoldRejectionReason | 'internal_error';
}

const CONTROLLED_UNAVAILABLE_PREFIX =
  '**Dossiê indisponível**\n\nO dossiê executivo não foi aprovado pelo processo de validação Gold e não está disponível nesta execução.';

/**
 * BRU-69 (política B+) — saída controlada quando não há Canonical seguro.
 * Nenhum byte do dossiê pré-Gold entra aqui: apenas a identidade do alvo
 * (parâmetros de entrada, nunca conteúdo do `dossierText`).
 */
export function buildControlledUnavailableOutput(companyName: string, cnpj: string | null | undefined): string {
  const header = cnpj ? `${companyName} — CNPJ ${cnpj}` : companyName;
  return `${CONTROLLED_UNAVAILABLE_PREFIX}\n\n**Alvo:** ${header}`;
}

/**
 * BRU-69 (política B+) — fallback factual mínimo determinístico montado
 * EXCLUSIVAMENTE de dados oficiais do CanonicalAccount. Sem LLM, sem
 * PORTA/score, sem oportunidade/recomendação/ROI/urgência, sem conteúdo
 * livre do dossiê pré-Gold. QSA aparece estritamente como QSA.
 */
export function buildFactualMinimalDossier(canonical: CanonicalAccount): string {
  const lines: string[] = [];
  lines.push('# Dossiê Cadastral');
  lines.push('');
  lines.push('> Saída factual reduzida — Gold não aprovado');
  lines.push('');
  lines.push('## Identidade legal');
  lines.push('');
  lines.push(`- **Razão social:** ${canonical.legalName}`);
  lines.push(`- **CNPJ:** ${canonical.inputCnpj}`);
  lines.push(`- **Tipo de estabelecimento:** ${canonical.establishmentType}`);
  lines.push(`- **CNPJ raiz:** ${canonical.rootCnpj}`);
  lines.push('');
  if (canonical.headOfficeLegalName || canonical.headOfficeCnpj) {
    lines.push('## Matriz');
    lines.push('');
    lines.push(`- ${canonical.headOfficeLegalName ?? '—'}${canonical.headOfficeCnpj ? ` — ${canonical.headOfficeCnpj}` : ''}`);
    lines.push('');
  }
  if (canonical.directPjPartners.length > 0) {
    lines.push('## Relações societárias diretas (PJ)');
    lines.push('');
    for (const partner of canonical.directPjPartners) {
      lines.push(`- ${partner.legalName} — ${partner.cnpj}`);
    }
    lines.push('');
  }
  if (canonical.qsaPeople.length > 0) {
    lines.push('## QSA (conforme registro cadastral)');
    lines.push('');
    for (const person of canonical.qsaPeople) {
      lines.push(`- ${person.name} — ${person.role}`);
    }
    lines.push('');
  }
  lines.push('## Não verificado nesta execução');
  lines.push('');
  lines.push(
    'Os demais itens do dossiê executivo não foram aprovados pelo processo de validação Gold e foram omitidos desta saída.',
  );
  lines.push('');
  return lines.join('\n');
}

/**
 * Deadline total do pós-processamento Gold (PACOTE 1 — SCOUT-V7-GOLD-BUDGET-
 * LAYERED-01, Planejador 2026-08-09). Orçamentos por camada, sem alterar
 * defaults não-Gold:
 * - SERVER_GOLD_CALL_BUDGET = 240s (timeoutMs por chamada, só intents gold,
 *   em api/llm.ts — LiteLLMCallInput.timeoutMs, que contorna o default/env)
 * - BROWSER_GOLD_CALL_BUDGET = 270s (override por chamada no llmProxy via
 *   adapter Gold; default 210s inalterado para os demais)
 * - GOLD_TOTAL_DEADLINE = 330s (aqui): canonical + compact + compose +
 *   verifier/contract; se o compact consumir os 240s, restam ~90s p/ compose.
 * Hierarquia: 240s server < 270s browser < 300s Vercel; pipeline ≤ 330s.
 * TimeoutError → fallback; abort do usuário → propaga.
 */
export const GOLD_DEADLINE_MS = 330_000;

/**
 * Pós-processamento fail-closed (política B+ — BRU-69):
 * - Gold elegível (Verifier sem hard fails + GoldContractValidator PASS) →
 *   devolve o Gold.
 * - Qualquer non-PASS COM Canonical seguro (verifier_fail, contract_fail,
 *   erro interno/timeout) → fallback factual mínimo determinístico (nunca o
 *   dossiê pré-Gold).
 * - canonical_null ou falha SEM Canonical seguro → saída controlada
 *   (fail-closed), sem devolver o pré-Gold como seguro.
 * - Abort do usuário NÃO é fallback — propaga.
 */
export async function tryEnhanceDossierWithGold(input: GoldSeamInput): Promise<string> {
  const { cnpj, companyName, dossierText, deps, signal, onStage, onRejected } = input;
  if (!deps.enabled || !cnpj) return dossierText;
  // Deadline total: combina o signal do usuário com um timeout de 330s.
  // TimeoutError → fallback; AbortError (usuário) → propaga.
  const goldSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(GOLD_DEADLINE_MS)])
    : AbortSignal.timeout(GOLD_DEADLINE_MS);
  let canonical: CanonicalAccount | null = null;
  try {
    canonical = await deps.buildCanonical(cnpj, companyName, goldSignal);
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    // canonical permanece null → saída controlada (fail-closed).
  }
  if (!canonical) {
    onStage?.('canonical-done', { resolved: false });
    onRejected?.('canonical_null');
    onStage?.('output-selected', { kind: 'controlled_unavailable', reason: 'canonical_null' } satisfies GoldOutputSelection);
    return buildControlledUnavailableOutput(companyName, cnpj);
  }
  onStage?.('canonical-done', { resolved: true });

  try {
    const result = await deps.runGold({ canonical, dossier: dossierText, segment: input.segment }, goldSignal, onStage);
    if (result.verification.hardFails.length > 0) {
      const codes = result.verification.hardFails.map((hardFail) => hardFail.code);
      const codeCounts = codes.reduce<Record<string, number>>((counts, code) => {
        counts[code] = (counts[code] ?? 0) + 1;
        return counts;
      }, {});
      onRejected?.('verifier_fail', {
        hardFails: codes.length,
        codes,
        codeCounts,
      });
      onStage?.('output-selected', { kind: 'factual_minimal', reason: 'verifier_fail' } satisfies GoldOutputSelection);
      return buildFactualMinimalDossier(canonical);
    }

    const contract = validateGoldContract(result.goldBrief);
    // BRU-103 (RCA-07): contract-done carrega violações ESTRUTURAIS (codes +
    // wordCount) — sem detail de texto Gold — para o reason exato do
    // contract_fail ser verificável em todo run (medir antes de corrigir).
    onStage?.('contract-done', {
      passed: contract.passed,
      violations: contract.violations.map((v) => v.code),
      wordCount: contract.metrics.wordCount,
    });
    if (!contract.passed) {
      onRejected?.('contract_fail');
      onStage?.('output-selected', { kind: 'factual_minimal', reason: 'contract_fail' } satisfies GoldOutputSelection);
      return buildFactualMinimalDossier(canonical);
    }

    onStage?.('output-selected', { kind: 'gold_pass' } satisfies GoldOutputSelection);
    return result.goldBrief;
  } catch (error) {
    // Abort do usuário NÃO é fallback: propaga para o fluxo preservar
    // CANCELLED. Qualquer outra falha interna (incl. TimeoutError do
    // deadline) com Canonical disponível → factual mínimo (B+).
    if (isAbortLikeError(error)) throw error;
    onStage?.('output-selected', { kind: 'factual_minimal', reason: 'internal_error' } satisfies GoldOutputSelection);
    return buildFactualMinimalDossier(canonical);
  }
}
