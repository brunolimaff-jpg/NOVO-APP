/**
 * V6 — Shadow CxB: runner das 25 execuções (5 CNPJs × 5 braços).
 *
 * Para cada CNPJ:
 *  1) canonical + dossiê são produzidos UMA vez e congelados (upstream);
 *  2) os 5 braços recebem o MESMO input (regra metodológica);
 *  3) cada braço roda o pipeline guarded (compact → sanitize → compose → verify);
 *  4) métricas por step (tokens/tempo/custo) + verifier + eventos são registrados.
 *
 * Saída: arquivos por empresa + relatório consolidado (tabela CxB).
 * Nenhuma chamada real se `dryRun=true` (harness zero-custo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runGuardedGoldPipeline, type CompactInput, type ComposeInput } from '../gold-pipeline.js';
import type { SafeFindingPack, SanitizerEvent, RawFindingPack } from '../gold-contracts.js';
import type { GoldVerificationResult } from '../entity-aware-gold-verifier.js';
import { CXB_ARMS, type CxBArm } from './cxb-arms.js';
import { createCxbAdapters, type ShadowStepMetrics } from './cxb-adapters.js';

export interface UpstreamRecord {
  cnpj: string;
  companyName: string;
  dossierChars: number;
  upstreamMs: number;
  upstreamCostUsd: number; // custo da pesquisa + dossiê atual
  generatedAt: string;
}

export interface ShadowRunRecord {
  cnpj: string;
  companyName: string;
  arm: CxBArm['id'];
  armLabel: string;
  inputHash: string;
  steps: ShadowStepMetrics[];
  goldBrief: string;
  goldBriefHash: string;
  verification: { passed: boolean; hardFails: string[] };
  sanitizerEvents: string[];
  goldTotalMs: number;
  goldCostUsd: number;
  endToEndMs: number;
  endToEndCostUsd: number;
  status: 'ok' | 'hard_fail' | 'error';
  error?: string;
}

export interface CxbInputProvider {
  getCanonicalAndDossier(cnpj: string, companyName: string): Promise<{ canonical: unknown; dossier: string; upstreamMs: number; upstreamCostUsd: number }>;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function runCxbShadow(
  accounts: Array<{ cnpj: string; companyName: string }>,
  provider: CxbInputProvider,
  options: { dryRun?: boolean; outDir: string },
): Promise<{ runs: ShadowRunRecord[]; upstream: UpstreamRecord[] }> {
  mkdirSync(options.outDir, { recursive: true });
  const runs: ShadowRunRecord[] = [];
  const upstream: UpstreamRecord[] = [];

  for (const account of accounts) {
    // 1) Input congelado UMA vez por CNPJ
    const { canonical, dossier, upstreamMs, upstreamCostUsd } = await provider.getCanonicalAndDossier(
      account.cnpj,
      account.companyName,
    );
    upstream.push({
      cnpj: account.cnpj,
      companyName: account.companyName,
      dossierChars: dossier.length,
      upstreamMs,
      upstreamCostUsd,
      generatedAt: new Date().toISOString(),
    });

    for (const arm of CXB_ARMS) {
      const armStarted = Date.now();
      let record: ShadowRunRecord;
      try {
        const adapters = options.dryRun ? createMockAdapters(arm) : createCxbAdapters(arm);
        const result = await runGuardedGoldPipeline(
          { canonical: canonical as never, dossier },
          { compact: adapters.compact, compose: adapters.compose },
        );
        const goldMs = Date.now() - armStarted;
        const goldCost =
          (adapters.lastMetrics.compact?.costUsd ?? 0) + (adapters.lastMetrics.compose?.costUsd ?? 0);
        const inputHash = sha256Hex(JSON.stringify(canonical) + dossier);
        const goldBriefHash = sha256Hex(result.goldBrief);
        const promptHash = sha256Hex(
          JSON.stringify({ compactor: arm.compactorModel, composer: arm.composerModel }),
        );
        record = {
          cnpj: account.cnpj,
          companyName: account.companyName,
          arm: arm.id,
          armLabel: arm.label,
          inputHash,
          steps: [adapters.lastMetrics.compact, adapters.lastMetrics.compose].filter(
            (s): s is ShadowStepMetrics => !!s,
          ),
          goldBrief: result.goldBrief,
          goldBriefHash,
          verification: { passed: result.verification.passed, hardFails: result.verification.hardFails.map((h) => h.code) },
          sanitizerEvents: result.sanitizerEvents.map((e) => e.code),
          goldTotalMs: goldMs,
          goldCostUsd: goldCost,
          endToEndMs: upstreamMs + goldMs,
          endToEndCostUsd: upstreamCostUsd + goldCost,
          status: result.verification.passed ? 'ok' : 'hard_fail',
        };

        // Persistência completa por run (contrato C do Planejador)
        persistRunArtifacts(options.outDir, account, arm, {
          canonical,
          dossier,
          inputHash,
          goldBrief: result.goldBrief,
          goldBriefHash,
          safePack: result.safePack,
          sanitizerEvents: result.sanitizerEvents,
          verification: result.verification,
          metrics: {
            upstreamMs,
            upstreamCostUsd,
            goldMs,
            goldCostUsd: goldCost,
            steps: adapters.lastMetrics,
            tokenUsage: {
              compact: {
                inputTokens: adapters.lastMetrics.compact?.inputTokens ?? 0,
                outputTokens: adapters.lastMetrics.compact?.outputTokens ?? 0,
              },
              compose: {
                inputTokens: adapters.lastMetrics.compose?.inputTokens ?? 0,
                outputTokens: adapters.lastMetrics.compose?.outputTokens ?? 0,
              },
            },
          },
          promptHash,
          modelIds: { compactor: arm.compactorModel, composer: arm.composerModel },
          provider: 'litellm-bedrock',
        });
      } catch (e) {
        if (options.dryRun) {
          // eslint-disable-next-line no-console
          console.warn(`[runner:dryRun] ${account.cnpj}-${arm.id} ERRO: ${(e as Error).message.slice(0, 200)}`);
        }
        record = {
          cnpj: account.cnpj,
          companyName: account.companyName,
          arm: arm.id,
          armLabel: arm.label,
          inputHash: sha256Hex(JSON.stringify(canonical) + dossier),
          steps: [],
          goldBrief: '',
          goldBriefHash: '',
          verification: { passed: false, hardFails: [] },
          sanitizerEvents: [],
          goldTotalMs: Date.now() - armStarted,
          goldCostUsd: 0,
          endToEndMs: upstreamMs + (Date.now() - armStarted),
          endToEndCostUsd: upstreamCostUsd,
          status: 'error',
          error: e instanceof Error ? e.message.slice(0, 300) : 'unknown',
        };
      }
      runs.push(record);

      // Arquivo por empresa × braço (Gold Brief legível)
      writeFileSync(
        join(options.outDir, `${account.cnpj}-${arm.id}-gold.md`),
        `# ${account.companyName} — Gold Brief (braço ${arm.id}: ${arm.label})\n\n` +
          (record.goldBrief || `(falha: ${record.error ?? 'sem saída'})`),
        'utf8',
      );
    }

    // Arquivo por empresa: resumo
    const companyRuns = runs.filter((r) => r.cnpj === account.cnpj);
    writeFileSync(
      join(options.outDir, `${account.cnpj}-resumo.md`),
      [
        `# ${account.companyName} (${account.cnpj}) — Resumo Shadow CxB`,
        '',
        `| Braço | Verifier | Hard fails | Gold ms | Gold US$ | E2E ms | E2E US$ |`,
        `|---|---|---|---|---|---|---|`,
        ...companyRuns.map(
          (r) =>
            `| ${r.arm} (${r.armLabel}) | ${r.verification.passed ? 'PASS' : 'FAIL'} | ${r.verification.hardFails.join(', ') || '-'} | ${r.goldTotalMs} | ${r.goldCostUsd.toFixed(4)} | ${r.endToEndMs} | ${r.endToEndCostUsd.toFixed(4)} |`,
        ),
        '',
        `Upstream: ${upstreamMs}ms · US$ ${upstreamCostUsd.toFixed(4)} (pesquisa + dossiê, congelado)`,
        '',
      ].join('\n'),
      'utf8',
    );
  }

  return { runs, upstream };
}

/**
 * Adapters MOCK para dry-run (zero custo, zero fetch). Usados pelo gate C
 * para provar a persistência completa sem chamadas reais.
 */
export function createMockAdapters(arm: CxBArm): {
  compact: (input: CompactInput) => Promise<RawFindingPack>;
  compose: (input: ComposeInput) => Promise<string>;
  lastMetrics: { compact?: ShadowStepMetrics; compose?: ShadowStepMetrics };
} {
  return {
    compact: async () => ({
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: [],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      discardedClaims: [],
    }),
    compose: async () => `# Gold Brief (mock braço ${arm.id})\n\nConteúdo determinístico para teste de persistência.`,
    lastMetrics: {},
  };
}

/**
 * Persistência completa por run (contrato C do Planejador). Cada execução
 * grava um diretório <outDir>/runs/<cnpj>-<arm>/ com os 12 artefatos
 * auditáveis: canonical.json, dossier-original.md, safe-finding-pack.json,
 * sanitizer-events.json, gold.md, verification.json, metrics.json,
 * run-manifest.json (contém hashes, model IDs, provider, tokenUsage).
 */
interface PersistRunInput {
  canonical: unknown;
  dossier: string;
  inputHash: string;
  goldBrief: string;
  goldBriefHash: string;
  safePack: SafeFindingPack;
  sanitizerEvents: SanitizerEvent[];
  verification: GoldVerificationResult;
  metrics: Record<string, unknown>;
  promptHash: string;
  modelIds: { compactor: string; composer: string };
  provider: string;
}

function persistRunArtifacts(
  outDir: string,
  account: { cnpj: string; companyName: string },
  arm: CxBArm,
  input: PersistRunInput,
): void {
  const runDir = join(outDir, 'runs', `${account.cnpj}-${arm.id}`);
  mkdirSync(runDir, { recursive: true });
  const write = (name: string, content: string) => writeFileSync(join(runDir, name), content, 'utf8');

  write('canonical.json', JSON.stringify(input.canonical, null, 2));
  write('dossier-original.md', input.dossier);
  write('safe-finding-pack.json', JSON.stringify(input.safePack, null, 2));
  write(
    'sanitizer-events.json',
    JSON.stringify(
      input.sanitizerEvents.map((e) => ({ code: e.code, action: e.action, after: e.after, reason: e.reason })),
      null,
      2,
    ),
  );
  write('gold.md', input.goldBrief);
  write('verification.json', JSON.stringify(input.verification, null, 2));
  write('metrics.json', JSON.stringify(input.metrics, null, 2));
  write(
    'run-manifest.json',
    JSON.stringify(
      {
        cnpj: account.cnpj,
        companyName: account.companyName,
        arm: arm.id,
        armLabel: arm.label,
        compactorModel: input.modelIds.compactor,
        composerModel: input.modelIds.composer,
        provider: input.provider,
        inputHash: input.inputHash,
        goldBriefHash: input.goldBriefHash,
        promptHash: input.promptHash,
        generatedAt: new Date().toISOString(),
        verifierVersion: 'corrigido-politica-B-2026-08-08',
      },
      null,
      2,
    ),
  );
}
