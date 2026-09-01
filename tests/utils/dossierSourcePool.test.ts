import { describe, expect, it } from 'vitest';
import { connectEvidencePackToPool, formatAvailableSourcesForPrompt } from '../../utils/dossierSourcePool';
import type { EvidencePack } from '../../services/llm/query-planner';

/**
 * BRU-158 Q1 — fronteira do EvidencePack (PipelineV2).
 *
 * Regressão provada no run real: `executeQueryPlan` coleta evidências web
 * (Brave/DDG) com `usableForReport=true`, mas o waterfall-orchestrator usa o
 * `pack` apenas para telemetria e o descarta — a evidência nunca chega ao
 * contexto dos módulos nem às fontes auditáveis do dossiê.
 *
 * Contrato do GREEN mínimo:
 * - Itens `usableForReport=true` entram no source pool EXISTENTE (sem segundo
 *   registry), preservando url/título + claim/proveniência (tier, entityMatch,
 *   queryOrigin, module).
 * - Itens rejeitados (`usableForReport=false`) NÃO entram.
 * - URL duplicada no pool NÃO duplica (merge por URL normalizada).
 * - O prompt de fontes disponíveis passa a incluir claim + proveniência.
 */
function makePack(items: Array<Partial<Parameters<typeof connectEvidencePackToPool>[0]['items'][number]>>): EvidencePack {
  return {
    items: items.map((partial, index) => ({
      id: `item-${index}`,
      sourceResult: {
        url: partial.sourceResult?.url ?? `https://exemplo.com/${index}`,
        title: partial.sourceResult?.title ?? `Fonte ${index}`,
        snippet: partial.sourceResult?.snippet ?? '',
        provider: 'web',
        retrievedAt: '2026-08-31T00:00:00Z',
      },
      evidenceTier: partial.evidenceTier ?? 'A',
      entityMatch: partial.entityMatch ?? 'exact',
      usableForReport: partial.usableForReport ?? true,
      queryOrigin: partial.queryOrigin ?? 'planner',
      module: partial.module ?? 'teia_identity',
      extractedClaim: partial.extractedClaim ?? 'afirmação extraída da fonte',
    })) as EvidencePack['items'],
    confidenceProfile: {
      totalUrls: items.length,
      uniqueUrls: items.length,
      tierACount: items.length,
      tierBCount: 0,
      tierCCount: 0,
      tierDCount: 0,
      modulesCovered: [],
    },
    collectedAt: '2026-08-31T00:00:00Z',
  };
}

describe('connectEvidencePackToPool (BRU-158 Q1)', () => {
  it('evidência usableForReport=true entra no pool com proveniência preservada', () => {
    const pack = makePack([
      {
        sourceResult: { url: 'https://agrolink.com.br/scheffer', title: 'Scheffer ampliação', snippet: '...' } as never,
        extractedClaim: 'Grupo Scheffer ampliou capacidade em 2025',
        evidenceTier: 'A',
        entityMatch: 'exact',
        queryOrigin: 'planner.teia',
        module: 'teia_identity' as never,
      },
    ]);

    const pool = connectEvidencePackToPool(pack, []);
    expect(pool).toHaveLength(1);
    expect(pool[0].url).toBe('https://agrolink.com.br/scheffer');
    expect(pool[0].title).toBe('Scheffer ampliação');
    expect(pool[0].extractedClaim).toBe('Grupo Scheffer ampliou capacidade em 2025');
    expect(pool[0].evidenceTier).toBe('A');
    expect(pool[0].entityMatch).toBe('exact');
    expect(pool[0].queryOrigin).toBe('planner.teia');
    expect(pool[0].moduleName).toBe('teia_identity');
    expect(pool[0].verification).toBe('grounding');
  });

  it('evidência usableForReport=false NÃO entra no pool', () => {
    const pack = makePack([
      { usableForReport: false, sourceResult: { url: 'https://spam.com/x', title: 'Spam', snippet: '' } as never },
    ]);
    expect(connectEvidencePackToPool(pack, [])).toHaveLength(0);
  });

  it('URL duplicada no pool não duplica (merge por URL normalizada)', () => {
    const pack = makePack([
      { sourceResult: { url: 'https://exemplo.com/dup', title: 'Dup', snippet: '' } as never },
    ]);
    const existing = [{ title: 'Dup (já no pool)', url: 'https://exemplo.com/dup' }];
    const pool = connectEvidencePackToPool(pack, existing);
    expect(pool).toHaveLength(1);
    expect(pool[0].title).toBe('Dup (já no pool)');
  });

  it('formatAvailableSourcesForPrompt inclui claim + proveniência quando presentes', () => {
    const pool = connectEvidencePackToPool(
      makePack([
        {
          sourceResult: { url: 'https://agrolink.com.br/scheffer', title: 'Scheffer ampliação', snippet: '' } as never,
          extractedClaim: 'Grupo Scheffer ampliou capacidade em 2025',
          evidenceTier: 'A',
          entityMatch: 'exact',
          queryOrigin: 'planner.teia',
          module: 'teia_identity' as never,
        },
      ]),
      [],
    );
    const block = formatAvailableSourcesForPrompt(pool);
    expect(block).toContain('https://agrolink.com.br/scheffer');
    expect(block).toContain('[tier=A]');
    expect(block).toContain('claim: Grupo Scheffer ampliou capacidade em 2025');
    expect(block).toContain('(teia_identity)');
    // BRU-158 microdelta (Gate 2): proveniência completa no prompt —
    // entityMatch e queryOrigin também devem aparecer no bloco formatado.
    expect(block).toContain('[match=exact]');
    expect(block).toContain('[origin=planner.teia]');
  });
});
