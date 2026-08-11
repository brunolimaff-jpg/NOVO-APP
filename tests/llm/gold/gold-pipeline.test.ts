import { describe, expect, it, vi } from 'vitest';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';
import {
  runGuardedGoldPipeline,
  type CompactInput,
  type ComposeInput,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';

/**
 * T5 — Gold pipeline/composer mínimo (TDD).
 * Orquestrador puro com compact/compose injetados. Não conhece LiteLLM,
 * HTTP, waterfall nem UI. Fronteira Raw→Safe→Frontier comprovada por spies.
 */

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [{ name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' }],
};

function rawPack(overrides: Partial<RawFindingPack> = {}): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [
      {
        id: 'f1',
        entity: 'SCHEFFER & CIA LTDA',
        claim: '74 módulos Senior ativos no CRM interno',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'operation',
      },
      {
        id: 'f2',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'A empresa não possui WMS',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'technology',
      },
    ],
    relationships: [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: '11.021.773/0001-70',
        relationType: 'partner_other_cnpj',
        status: 'Confirmado',
        source: 'socio-search',
      },
    ],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    discardedClaims: [],
    ...overrides,
  };
}

const cleanGold = [
  '# Gold Brief',
  'SCHEFFER & CIA LTDA (04.733.767/0001-80) é filial em Sapezal/MT; a matriz é 04.733.767/0014-03 em Cuiabá.',
  'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A (11.021.773/0001-70).',
].join('\n');

const trappedGold = ['# Gold Brief', 'Há um gap de WMS confirmado na operação logística.'].join('\n');

describe('GuardedGoldPipeline', () => {
  it('BRU-48: Gold do Composer com "confirmada" em tema sensível sem fato Confirmado é rebaixado (sem PROMOTED_CLAIM)', async () => {
    // Caso Scheffer reproduzido: o Composer escapa e escreve "confirmada"
    // para internacionalização (Colômbia/Cumaribo) sem fato Confirmado no
    // safePack. O verifier marca PROMOTED_CLAIM (R8) — o guard do pipeline
    // deve rebaixar o vocabulário para "mencionada" ANTES do verifier.
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'Operação internacional confirmada em Cumaribo, Colômbia, mencionada no site institucional.',
        'A holding SCHEFFER PARTICIPACOES S/A é confirmada como sócia direta.',
      ].join('\n'),
    );
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(result.verification.passed).toBe(true);
    expect(result.verification.hardFails.some(h => h.code === 'PROMOTED_CLAIM')).toBe(false);
    // O vocabulário de certeza foi rebaixado na fonte (informação preservada).
    expect(result.goldBrief).toMatch(/mencionada.*Cumaribo|mencionada como sócia|mencionad[ao]/i);
  });

  it('BRU-48 RED cruzado: fato Confirmado sensível A NÃO autoriza claim sensível não relacionado B (sem bypass global)', async () => {
    // SafePack tem fato Confirmado sobre HOLDING (A) — mas o Gold afirma
    // internacionalização "confirmada" (B), sem fato Confirmado que case
    // com Colômbia/Cumaribo/internacional. O guard não pode ser desabilitado
    // globalmente pelo fato A: B deve ser rebaixado.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          {
            id: 'f1',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'A holding SCHEFFER PARTICIPACOES S/A participa do capital da conta',
            status: 'Confirmado',
            source: 'QSA oficial',
            kind: 'operation',
          },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'Operação internacional confirmada em Cumaribo, Colômbia, mencionada no site institucional.',
      ].join('\n'),
    );
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(result.verification.passed).toBe(true);
    expect(result.verification.hardFails.some(h => h.code === 'PROMOTED_CLAIM')).toBe(false);
    // A frase internacional foi rebaixada mesmo existindo fato Confirmado de holding.
    expect(result.goldBrief).toMatch(/mencionada em Cumaribo/i);
  });

  it('BRU-48 autorização local: fato Confirmado (fonte forte) que casa com o tema da frase mantém "confirmada"', async () => {
    // Fato sensível Confirmado com fonte FORTE (registro oficial — não é
    // rebaixado pelo STATUS_PROMOTION, que só atinge fonte institucional).
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          {
            id: 'f1',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'Operação em Cumaribo, Colômbia, registrada no cadastro oficial',
            status: 'Confirmado',
            source: 'registro oficial',
            kind: 'operation',
          },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'Operação confirmada em Cumaribo, Colômbia, registrada no cadastro oficial.',
      ].join('\n'),
    );
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(result.verification.passed).toBe(true);
    // Autorizado localmente: o fato Confirmado casa com o tema da frase.
    expect(result.goldBrief).toMatch(/confirmada em Cumaribo/i);
  });

  it('executa compact → sanitize → compose → verify e retorna o resultado', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(compact).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(result.goldBrief).toBe(cleanGold);
    expect(result.sanitizerEvents.some((e) => e.code === 'NEGATIVE_EVIDENCE_AS_ABSENCE')).toBe(true);
    expect(result.verification.passed).toBe(true);
  });

  it('comprova a fronteira: compact recebe canonical+dossier; frontier recebe apenas SafeFindingPack', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    // compact recebeu canonical + dossier
    const compactInput = compact.mock.calls[0][0];
    expect(compactInput.canonical).toBe(canonical);
    expect(compactInput.dossier).toBe('dossiê legado');

    // frontier recebeu SafeFindingPack (sanitized: true) e NUNCA o Raw
    const frontierInput = compose.mock.calls[0][0];
    expect(frontierInput.safePack.sanitized).toBe(true);
    expect(frontierInput.safePack).not.toBe(rawPack());
    // o frontier NÃO recebe material bruto: sem originalPack, sem discardedClaims
    expect('originalPack' in frontierInput.safePack).toBe(false);
    expect('discardedClaims' in frontierInput.safePack).toBe(false);
    // claim removida pelo sanitizer não aparece em NENHUMA parte do payload
    expect(JSON.stringify(frontierInput)).not.toContain('não possui WMS');
  });

  it('não envia CPF ao frontier (guard do sanitizer)', async () => {
    const raw = rawPack();
    raw.facts.push({
      id: 'f-cpf',
      entity: 'PESSOA',
      claim: 'Sócio com CPF 123.456.789-00',
      status: 'Confirmado',
      source: 'QSA oficial',
      kind: 'person',
    });
    const compact = vi.fn(async (_input: CompactInput) => raw);
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps);
    // asserção REAL: o CPF formatado (com pontuação) e sem pontuação
    // não podem existir em NENHUMA parte do payload do frontier
    const serializedFrontier = JSON.stringify(compose.mock.calls[0][0]);
    expect(serializedFrontier).not.toContain('123.456.789');
    expect(serializedFrontier).not.toContain('123456789');
    expect(result.sanitizerEvents.some((e) => e.code === 'CPF_LEAK')).toBe(true);
  });

  it('falha fechado quando o compactor devolve JSON fora do schema (fail-closed antes do sanitizer)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => ({ module: "incompleto" } as unknown as RawFindingPack));
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await expect(runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps)).rejects.toThrow();
    expect(compose).not.toHaveBeenCalled();
  });

  it('reprova Gold com trap (verifier captura o que escapar do sanitizer)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => trappedGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const stages: Array<{ stage: string; detail?: unknown }> = [];
    const result = await runGuardedGoldPipeline(
      { canonical, dossier: 'dossiê' },
      deps,
      undefined,
      (stage, detail) => stages.push({ stage, detail }),
    );
    expect(result.verification.passed).toBe(false);
    expect(result.verification.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(true);
    const verifierStage = stages.find((entry) => entry.stage === 'verifier-done');
    expect(verifierStage?.detail).toMatchObject({
      hardFails: expect.any(Number),
      codes: expect.arrayContaining(['NEGATIVE_EVIDENCE_AS_GAP']),
      codeCounts: expect.objectContaining({ NEGATIVE_EVIDENCE_AS_GAP: expect.any(Number) }),
    });
    expect(verifierStage?.detail).not.toHaveProperty('reason');
  });

  it('reclassifica relação lateral pela precedência canônica antes do sanitizer', async () => {
    const raw = rawPack();
    // PJ direta classificada errado como lateral pelo compactor
    raw.relationships = [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: '11.021.773/0001-70',
        relationType: 'partner_other_cnpj',
        status: 'Confirmado',
        source: 'socio-search',
      },
    ];
    const compact = vi.fn(async (_input: CompactInput) => raw);
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps);
    const frontierInput = compose.mock.calls[0][0];
    const direct = frontierInput.safePack.relationships.find((r) => r.relatedEntity.includes('11.021.773'));
    expect(direct?.relationType).toBe('direct_pj_relation');
  });

  // ─── BRU-33: telemetria por etapa (veredito do Planejador 2026-08-09) ─────

  it('emite a sequência completa de estágios no sucesso (compact→…→verifier)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };
    const stages: Array<{ stage: string; detail?: unknown }> = [];

    const result = await runGuardedGoldPipeline(
      { canonical, dossier: 'dossiê legado' },
      deps,
      undefined,
      (stage, detail) => stages.push({ stage, detail }),
    );

    expect(stages.map((s) => s.stage)).toEqual([
      'compact-start',
      'compact-response',
      'raw-schema-ok',
      'sanitize-done',
      'frontier-schema-ok',
      'compose-start',
      'compose-done',
      'mermaid-inject',
      'verifier-done',
    ]);
    // métricas presentes, conteúdo nunca (sem dados sensíveis)
    expect(stages[0].detail).toMatchObject({ chars: 'dossiê legado'.length });
    expect(stages[1].detail).toMatchObject({ chars: expect.any(Number) });
    expect(stages[stages.length - 1].detail).toMatchObject({ hardFails: 0, codes: [], codeCounts: {} });
    expect(stages[stages.length - 1].detail).not.toHaveProperty('reason');
    expect(stages[stages.length - 1].detail).not.toHaveProperty('claim');
    expect(result.verification.passed).toBe(true);
  });

  it('emite raw-schema-fail com evidência (issues + firstIssuePath) antes do throw fail-closed', async () => {
    const compact = vi.fn(async () => ({ module: 'incompleto' } as unknown as RawFindingPack));
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };
    const stages: string[] = [];

    await expect(
      runGuardedGoldPipeline(
        { canonical, dossier: 'dossiê' },
        deps,
        undefined,
        (stage, detail) => stages.push(`${stage}:${detail?.firstIssuePath ?? '-'}`),
      ),
    ).rejects.toThrow(/RawFindingPack fora do schema/);

    expect(stages[0]).toMatch(/^compact-start/);
    expect(stages[1]).toMatch(/^compact-response/);
    expect(stages[2]).toMatch(/^raw-schema-fail:/);
    expect(stages.length).toBe(3);
    expect(compose).not.toHaveBeenCalled();
  });

  it('emite compact-error com a mensagem curta quando o compact lança (ex.: parseJsonPayload)', async () => {
    const compact = vi.fn(async () => {
      throw new Error('JSON inválido: esperado objeto na resposta do compactor');
    });
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };
    const stages: string[] = [];

    await expect(
      runGuardedGoldPipeline(
        { canonical, dossier: 'dossiê' },
        deps,
        undefined,
        (stage, detail) => stages.push(`${stage}:${detail?.detail ?? '-'}`),
      ),
    ).rejects.toThrow('JSON inválido');

    expect(stages).toEqual([
      'compact-start:-',
      'compact-error:JSON inválido: esperado objeto na resposta do compactor',
    ]);
    expect(compose).not.toHaveBeenCalled();
  });

  it('emite frontier-schema-fail com evidência quando o pack sanitizado sai do schema', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };
    const stages: string[] = [];
    const sanitizerModule = await import('../../../services/llm/gold/finding-sanitizer');
    // captura a implementação REAL antes do spy (o binding do namespace é live)
    const originalSanitize = sanitizerModule.sanitizeFindingPack;
    const spy = vi.spyOn(sanitizerModule, 'sanitizeFindingPack').mockImplementation((pack, canonical) => {
      const real = originalSanitize(pack, canonical);
      // roda o sanitizer REAL e depois corrompe um campo que o FrontierPack
      // valida (o Raw já passou) — força o frontier-schema-fail
      return { ...real, facts: 'corrompido' } as never;
    });

    try {
      await expect(
        runGuardedGoldPipeline(
          { canonical, dossier: 'dossiê' },
          deps,
          undefined,
          (stage, detail) => stages.push(`${stage}:${detail?.firstIssuePath ?? '-'}`),
        ),
      ).rejects.toThrow();
      expect(stages.some((s) => s.startsWith('frontier-schema-fail:facts'))).toBe(true);
      expect(stages.includes('compose-start')).toBe(false);
      expect(compose).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
