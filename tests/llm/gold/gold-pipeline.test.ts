import { describe, expect, it, vi } from 'vitest';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';
import {
  runGuardedGoldPipeline,
  downgradeUnsupportedCertainty,
  type CompactInput,
  type ComposeInput,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';

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

// PATCH-C: o trap foi reformulado — o preflight agora trata GAP, então o
// trap usa um hard fail NÃO pertencente ao preflight (INVENTED_CNPJ) para
// provar que o verifier final continua fail-closed.
const trappedGold = ['# Gold Brief', 'A controlada 99.999.999/0001-00 atua no segmento de fertilizantes.'].join('\n');

describe('LOTE GOLD P0 R2-B — fronteiras estruturais de diagnóstico', () => {
  it('emite post-preflight/post-mermaid/post-certainty com codes/counts e SEM conteúdo sensível', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => trappedGold);
    const deps = { compact, compose };
    const stages: Array<{ stage: string; detail?: unknown }> = [];
    const onStage = vi.fn((stage: string, detail?: unknown) => {
      stages.push({ stage, detail });
    });

    // ARCH-B (BRU-111): INVENTED_CNPJ residual pós-normalização impede o
    // builder (fail-closed com códigos observáveis) — o trap não chega ao
    // mermaid nem ao verifier final.
    await expect(
      runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps, undefined, onStage as never),
    ).rejects.toThrow(/GoldI7FailClosed/);

    // o post-preflight continua sendo emitido com a fronteira estrutural
    const postPreflight = stages.find(s => s.stage === 'diagnostics-post-preflight');
    expect(postPreflight).toBeDefined();
    expect(postPreflight?.detail).toHaveProperty('hardFails');
    expect(postPreflight?.detail).toHaveProperty('codes');
    expect(postPreflight?.detail).toHaveProperty('codeCounts');
    // NUNCA reason/claim/conteúdo
    expect(JSON.stringify(postPreflight?.detail)).not.toContain('reason');
    expect(JSON.stringify(postPreflight?.detail)).not.toContain('99.999.999');
    expect(JSON.stringify(postPreflight?.detail)).not.toContain('fertilizantes');

    // localização: a falha INVENTED_CNPJ já existe pós-preflight
    expect((postPreflight?.detail as { codes?: string[] } | undefined)?.codes ?? []).toContain('INVENTED_CNPJ');

    // ARCH-B: fail-closed com códigos/counts, SEM conteúdo; builder NÃO roda
    const failClosed = stages.find(s => s.stage === 'i7-fail-closed');
    expect(failClosed).toBeDefined();
    expect(failClosed?.detail).toHaveProperty('codes');
    expect(failClosed?.detail).toHaveProperty('codeCounts');
    expect(JSON.stringify(failClosed?.detail)).not.toContain('99.999.999');
    expect(stages.some(s => s.stage === 'mermaid-inject')).toBe(false);
  });

  it('fronteiras limpas emitem hardFails 0 e codes vazio (não fabrica falha)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps = { compact, compose };
    const stages: Array<{ stage: string; detail?: unknown }> = [];

    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps, undefined, (stage, detail) => {
      stages.push({ stage, detail });
    });

    for (const stage of ['diagnostics-post-preflight', 'diagnostics-post-mermaid', 'diagnostics-post-certainty']) {
      const emitted = stages.find(s => s.stage === stage);
      const detail = emitted?.detail as { hardFails?: number; codes?: string[] } | undefined;
      expect(detail?.hardFails).toBe(0);
      expect(detail?.codes).toEqual([]);
    }
  });
});

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

  it('BRU-48 RED final (Planejador): fato Confirmado "exportações para a Colômbia" NÃO autoriza "Operação industrial confirmada em Cumaribo"', async () => {
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          {
            id: 'f1',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'Exportações para a Colômbia constam em registro oficial',
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
        'Operação industrial confirmada em Cumaribo, Colômbia.',
      ].join('\n'),
    );
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(result.verification.passed).toBe(true);
    expect(result.verification.hardFails.some(h => h.code === 'PROMOTED_CLAIM')).toBe(false);
    // Mesmo tema (Colômbia), claim diferente (exportação ≠ operação industrial):
    // a certeza é rebaixada — "confirmada" não pode permanecer.
    expect(result.goldBrief).toMatch(/mencionada em Cumaribo/i);
    expect(result.goldBrief).not.toMatch(/confirmada em Cumaribo/i);
  });

  it('BRU-48 guard conservador: temas sensíveis SEMPRE rebaixam "confirmada" (sem autorização por similaridade)', async () => {
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
    // Decisão do Planejador: não autorizar por similaridade — sempre rebaixa.
    expect(result.goldBrief).toMatch(/mencionada em Cumaribo/i);
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

  it('reprova Gold com trap (ARCH-B: INVENTED_CNPJ residual cai fail-closed antes do builder)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => trappedGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const stages: Array<{ stage: string; detail?: unknown }> = [];
    await expect(
      runGuardedGoldPipeline(
        { canonical, dossier: 'dossiê' },
        deps,
        undefined,
        (stage, detail) => stages.push({ stage, detail }),
      ),
    ).rejects.toThrow(/GoldI7FailClosed/);
    const failClosed = stages.find((entry) => entry.stage === 'i7-fail-closed');
    expect(failClosed?.detail).toMatchObject({
      hardFails: expect.any(Number),
      codes: expect.arrayContaining(['INVENTED_CNPJ']),
      codeCounts: expect.objectContaining({ INVENTED_CNPJ: expect.any(Number) }),
    });
    expect(failClosed?.detail).not.toHaveProperty('reason');
    expect(stages.some((s) => s.stage === 'mermaid-inject')).toBe(false);
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
      // RCA-02 — fronteira discriminante pré-Composer (probe semântico)
      'diagnostics-pre-compose',
      'compose-start',
      'compose-done',
      // LOTE GOLD P0 R2-B — fronteiras estruturais entre as transformações
      'diagnostics-post-preflight',
      // ARCH-C (BRU-112) — Narrative Gate (pré-builder)
      'narrative-contract-done',
      'mermaid-inject',
      'diagnostics-post-mermaid',
      'diagnostics-post-certainty',
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

  it('POST-MERMAID RED: fato Confirmado sensível no SafePack é injetado pelo Mermaid após o guard → PROMOTED_CLAIM (fronteira pós-Composer)', async () => {
    // Caso A2 do origin-map: o Composer devolve texto limpo, mas o builder
    // determinístico injeta fact.claim de fato Confirmado sensível DEPOIS do
    // guard BRU-48 — o verifier (R8) vê "confirmada" em tema sensível.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          {
            id: 'f1',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'Operação industrial confirmada em Cumaribo',
            status: 'Confirmado',
            source: 'comunicado oficial',
            kind: 'operation',
          },
          {
            id: 'f2',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'Produção de grãos em Sapezal',
            status: 'Confirmado',
            source: 'comunicado oficial',
            kind: 'operation',
          },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera produção de grãos em Sapezal.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    // O guard (BRU-48) deve proteger TAMBÉM o texto determinístico pós-Composer.
    expect(result.verification.hardFails.some((h) => h.code === 'PROMOTED_CLAIM')).toBe(false);
  });

  it('POST-MERMAID RED: claim longo sustentado truncado pelo builder → reconciliação de medida destruída (UNSUPPORTED_PRODUCT_CLAIM)', async () => {
    // Caso D3 do origin-map: claim Confirmado com fonte externa e medida
    // válida; o Mermaid corta em 57+"..." e o verifier não reconcilia a
    // medida com o fato — a representação determinística não pode destruir
    // a evidência que era válida antes do Mermaid.
    const longClaim = 'A empresa possui capacidade de produção de 120 mil sacas de soja por ano na unidade industrial de Sapezal';
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          {
            id: 'f1',
            entity: 'SCHEFFER & CIA LTDA',
            claim: longClaim,
            status: 'Confirmado',
            source: 'notícia oficial',
            kind: 'operation',
          },
          {
            id: 'f2',
            entity: 'SCHEFFER & CIA LTDA',
            claim: 'Operação de esmagamento em Sapezal',
            status: 'Confirmado',
            source: 'notícia oficial',
            kind: 'operation',
          },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera esmagamento em Sapezal.',
        longClaim + '.',
        '### 2. PERFIL',
        'A empresa opera esmagamento em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });

  it('PREFLIGHT RED 1: negação de posse do Composer sem suporte é removida do Gold final (NEGATIVE_EVIDENCE_AS_ABSENCE=0)', async () => {
    // Caso B2 do origin-map: "A empresa não possui WMS." vem do Composer e o
    // SafePack não fornece prova que legitime a conclusão.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera produção de grãos em Sapezal.',
        'A empresa não possui WMS.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_ABSENCE')).toBe(false);
    expect(result.goldBrief).not.toContain('não possui WMS');
  });

  it('PREFLIGHT RED 2: fraqueza operacional do Composer sem proveniência é removida (ABSENCE_DERIVED_WEAKNESS=0)', async () => {
    // Família C do origin-map sem proveniência externa correspondente.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera com processos manuais.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(false);
    expect(result.goldBrief).not.toContain('processos manuais');
  });

  it('PREFLIGHT RED 3: claim de capacidade sem suporte é removido (UNSUPPORTED_PRODUCT_CLAIM=0)', async () => {
    // Caso D1 do origin-map: capacidade sem fato compatível no SafePack.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa tem capacidade de produção de 120 mil sacas.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
    expect(result.goldBrief).not.toContain('120 mil sacas');
  });

  it('PREFLIGHT CP1: fraqueza com proveniência externa válida é PRESERVADA (ABSENCE ausente)', async () => {
    // B4: fato externo Confirmado, mesma entidade, mesma categoria, direção compatível.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Processos manuais identificados em auditoria externa', status: 'Confirmado', source: 'auditoria externa', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera com processos manuais.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(false);
    expect(result.goldBrief).toContain('processos manuais');
  });

  it('PREFLIGHT CP2: claim quantitativo sustentado é PRESERVADO (UNSUPPORTED ausente)', async () => {
    // Fato Confirmado, fonte aceitável, mesma entidade, categoria, quantidade e unidade.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'A empresa possui capacidade de produção de 120 mil sacas por ano', status: 'Confirmado', source: 'notícia oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'notícia oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa tem capacidade de produção de 120 mil sacas por ano.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
    expect(result.goldBrief).toContain('120 mil sacas por ano');
  });

  it('PREFLIGHT AM1: linha com alvo (GAP) + não-alvo NÃO é removida (verifier final continua reprovando com INVENTED_CNPJ)', async () => {
    // Anti-mascaramento (PATCH-C): adicionar GAP aos targets não pode
    // transformar o preflight em apagador de hard fails não-alvo.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera com um gap de automação e a controlada 99.999.999/0001-00 atua em fertilizantes.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    // ARCH-B (BRU-111): a linha com alvo (GAP) + não-alvo (INVENTED_CNPJ)
    // NÃO é removida pelo preflight (anti-mascaramento) e o residual
    // INVENTED_CNPJ cai fail-closed antes do builder.
    await expect(
      runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose }),
    ).rejects.toThrow(/GoldI7FailClosed.*INVENTED_CNPJ/);
  });

  it('PATCH-C RED GAP: frase de gap do Composer é removida pelo preflight (NEGATIVE_EVIDENCE_AS_GAP=0)', async () => {
    // Família GAP (verifier:358 "Frase afirma gap sem evidência positiva"):
    // o preflight publicado esqueceu NEGATIVE_EVIDENCE_AS_GAP nos TARGET_CODES.
    const compact = vi.fn(async (_input: CompactInput) =>
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
    );
    const compose = vi.fn(async (_input: ComposeInput) =>
      [
        '# Gold Brief',
        'A empresa opera com um gap de automação na operação.',
        '### 2. PERFIL',
        'A empresa opera produção de grãos em Sapezal.',
        '### 3. ESTRUTURA SOCIETÁRIA',
        'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A.',
        '### 9. PRÓXIMOS PASSOS',
        'Nenhum.',
      ].join('\n'),
    );
    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, { compact, compose });
    expect(result.verification.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(false);
    expect(result.goldBrief).not.toContain('gap de automação');
  });

  it('PATCH-C RED segmentation: CNPJ formatado + tema + "confirmada" — guard deixa escapar e verifier reprova (PROMOTED_CLAIM)', async () => {
    // Divergência de segmentação: o guard divide em [.;!?\n] sem proteger CNPJ
    // formatado; o verifier protege CNPJ antes de dividir sentenças.
    // Frase: tema ANTES do CNPJ, certeza DEPOIS dele.
    const sentence = 'Internacionalização da Scheffer CNPJ 04.733.767/0001-80 confirmada por fonte institucional.';
    const safePack = sanitizeFindingPack(
      rawPack({
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Produção de grãos em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
          { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação de esmagamento em Sapezal', status: 'Confirmado', source: 'comunicado oficial', kind: 'operation' },
        ],
      }),
      canonical,
    );
    const downgraded = downgradeUnsupportedCertainty(sentence);
    // RED: o guard atual deixa "confirmada" escapar (ponto do CNPJ quebra a
    // sentença antes de o tema se juntar ao vocabulário de certeza).
    expect(downgraded).not.toContain('confirmada');
    const verification = verifyGold(downgraded, canonical, safePack);
    expect(verification.hardFails.some((h) => h.code === 'PROMOTED_CLAIM')).toBe(false);
  });
});
