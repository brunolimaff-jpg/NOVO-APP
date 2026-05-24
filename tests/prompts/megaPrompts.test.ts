import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import megaPrompts, {
  ALL_SPECIALIST_PROMPTS,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_VERSION,
  SELLER_BRIEF_MODULE_OUTPUT_CONTRACT,
  SHARED_FOUNDATION_BLOCK,
  buildInvestigationHiddenPrompt,
  buildLegacyCompatibleHiddenPrompt,
} from '../../prompts/megaPrompts';

const digestPrompt = (label: string, prompt: string) => {
  const normalized = prompt.replace(/\r\n?/g, '\n');
  return {
    label,
    length: normalized.length,
    lines: normalized.split('\n').length,
    sha256: createHash('sha256').update(normalized).digest('hex'),
  };
};

describe('PORTA mega prompts', () => {
  it('keeps each deep dive framed as a specialist module instead of a full dossier rewrite', () => {
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('<system_context>');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('<system_context>');
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('<system_context>');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('<system_context>');
    expect(PROMPT_RH_SINDICATOS_GOD_MODE).toContain('<system_context>');
    expect(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).toContain('<system_context>');
  });

  it('includes feed markers in the operational prompt', () => {
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('[[PORTA_FEED_O:[NOTA]:ELOS:[LISTA_ELOS]]]');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('[[PORTA_FLAG:NOFIT:[SIM/NAO]]]');
  });

  it('strengthens the operational prompt for pecuaria, frota and ESG signals', () => {
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('Peccode');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('Multibovinos');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('PRO Carbono');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('hidrel\u00e9trica');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain(
      'N\u00c3O ative NOFIT para empresas que combinam pecu\u00e1ria com agr\u00edcola',
    );
  });

  it('keeps only T markers in the tech stack prompt', () => {
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain(
      '[[PORTA_FEED_T:[NOTA_FINAL]:T1:[NOTA]:T2:[NOTA]:T3:[NOTA]:STACK:[ERP_IDENTIFICADO]]]',
    );
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('flags Delphi and other legacy languages as strong tech debt signals', () => {
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('Desenvolvedor Delphi');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('Analista Clipper');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('Visual Basic');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('FoxPro');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('\u26a0\ufe0f SINAL DE SISTEMA LEGADO');
  });

  it('includes R and TRAD markers in the compliance prompt', () => {
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('[[PORTA_FEED_R:[NOTA]:PRESSOES:[LISTA]]]');
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain(
      '[[PORTA_FLAG:TRAD:[SIM/NAO]:NATUREZA:[PRODUCAO/TRADING/MISTA]]]',
    );
  });

  it('treats originacao plus producao as opportunity instead of TRAD penalty', () => {
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain(
      'Empresa que produz E faz origina\u00e7\u00e3o = MISTA \u2192 TRAD = NAO',
    );
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('ABNT');
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('PRO Carbono');
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain(
      'CONTRAPESOS DE COMPLIANCE E GOVERNAN\u00c7A',
    );
  });

  it('includes P and segment markers in the expansion prompt', () => {
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain(
      '[[PORTA_FEED_P:[NOTA]:HA:[HECTARES]:CNPJS:[TOTAL]:FAT:[FATURAMENTO]]]',
    );
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('[[PORTA_SEG:[PRD/AGI/COP]]]');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('uses the stricter COP -> AGI -> PRD segment logic and diversified verticals', () => {
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('COP > AGI > PRD');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain(
      '\u00c9 cooperativa agr\u00edcola? \u2192 COP',
    );
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('mais de 3 verticais');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('energia');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('piscicultura');
  });

  it('includes P proxy, R trabalhista and A2 markers in the RH prompt', () => {
    expect(PROMPT_RH_SINDICATOS_GOD_MODE).toContain('[[PORTA_FEED_P_PROXY:FUNC:[TOTAL_FUNCIONARIOS]]]');
    expect(PROMPT_RH_SINDICATOS_GOD_MODE).toContain('[[PORTA_FEED_R_TRAB:[NOTA]:PASSIVOS:[LISTA]]]');
    expect(PROMPT_RH_SINDICATOS_GOD_MODE).toContain(
      '[[PORTA_FEED_A2:[NOTA]:TIMING:[BOM/NEUTRO/RUIM]:FASE:[FASE_ATUAL]]]',
    );
  });

  it('includes only A markers in the decisor prompt', () => {
    expect(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).toContain(
      '[[PORTA_FEED_A:[NOTA_FINAL]:A1:[NOTA]:A2:[NOTA]:GERACAO:[G1/G2/PROF]]]',
    );
    expect(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('keeps PORTA as an internal layer instead of visible scoring language in module outputs', () => {
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).not.toContain('### \ud83d\udcca BLOCO DE FEEDS PORTA');
    expect(PROMPT_RAIO_X_OPERACIONAL_ATAQUE).not.toContain('Nota O sugerida');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).not.toContain('Nota T2 sugerida');
    expect(PROMPT_TECH_STACK_GOD_MODE_ATAQUE).not.toContain('NOTA T FINAL');
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).not.toContain('### \ud83d\udcca BLOCO DE FEEDS PORTA');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('Nota P sugerida');
    expect(PROMPT_RH_SINDICATOS_GOD_MODE).not.toContain('Nota A2 sugerida');
    expect(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).not.toContain('Nota A1 sugerida');
  });

  it('declares the compact seller-facing output contract for module generation', () => {
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('MAPAS VISUAIS + CARDS AUDITÁVEIS');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('Não gere seção "Brief de Reunião"');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('## Mapas Visuais');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('## Cards de Auditoria');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('### Card: [título comercial do insight]');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('**Pergunta de reunião:**');
    expect(SHARED_FOUNDATION_BLOCK).toContain(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT);
  });

  it('keeps the facade metadata and specialist prompt collection stable', () => {
    expect(PROMPT_VERSION).toBe('Scout360_v5.0_ExecutiveCommitteeGrade');
    expect(ALL_SPECIALIST_PROMPTS).toHaveLength(7);
    expect(new Set(ALL_SPECIALIST_PROMPTS).size).toBe(ALL_SPECIALIST_PROMPTS.length);
    expect(ALL_SPECIALIST_PROMPTS).toEqual([
      PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
      PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
      PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
      PROMPT_RADAR_EXPANSAO_GOD_MODE,
      PROMPT_RH_SINDICATOS_GOD_MODE,
      PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
      PROMPT_ORCAMENTO_JANELA_GOD_MODE,
    ]);
  });

  it('keeps the legacy-compatible builder output stable through the facade', () => {
    const prompt = buildLegacyCompatibleHiddenPrompt({
      companyName: 'Fazenda Modelo',
      cnpj: '12.345.678/0001-99',
      city: 'Cuiaba',
      state: 'MT',
    });

    expect(prompt).toContain('INVESTIGACAO_COMPLETA_INTEGRADA (MVP+):');
    expect(prompt).toContain('Empresa=Fazenda Modelo; CNPJ=12.345.678/0001-99; Cidade=Cuiaba; UF=MT.');
    expect(prompt).toContain(SHARED_FOUNDATION_BLOCK);
    expect(prompt).toContain(PROMPT_RAIO_X_OPERACIONAL_ATAQUE);
    expect(prompt).toContain(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE);
    expect(prompt).not.toContain(PROMPT_ORCAMENTO_JANELA_GOD_MODE);
  });

  it('keeps deterministic golden baselines for LLM prompt inputs before markdown migration', () => {
    const fullInvestigationPayload = {
      companyName: 'Fazenda Modelo',
      cnpj: '12.345.678/0001-99',
      city: 'Cuiaba',
      state: 'MT',
      aliases: ['Grupo Modelo', 'Modelo Agro'],
      segmentHint: 'PRD',
    };

    expect([
      digestPrompt('shared-foundation', SHARED_FOUNDATION_BLOCK),
      ...ALL_SPECIALIST_PROMPTS.map((prompt, index) => digestPrompt(`specialist-${index + 1}`, prompt)),
      digestPrompt(
        'legacy-compatible-hidden-prompt',
        buildLegacyCompatibleHiddenPrompt({
          companyName: fullInvestigationPayload.companyName,
          cnpj: fullInvestigationPayload.cnpj,
          city: fullInvestigationPayload.city,
          state: fullInvestigationPayload.state,
        }),
      ),
      digestPrompt(
        'executive-full-hidden-prompt',
        buildInvestigationHiddenPrompt(fullInvestigationPayload, {
          includeBudget: true,
          mode: 'executive',
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
        }),
      ),
      digestPrompt(
        'war-mode-minimal-hidden-prompt',
        buildInvestigationHiddenPrompt({
          companyName: 'Cooperativa Horizonte',
          cnpj: undefined,
          city: '',
          state: 'PR',
        }, {
          includeBudget: false,
          mode: 'warMode',
          strictAudit: false,
          enableDiscrepancyHunter: false,
          enableCostOfDelay: false,
        }),
      ),
    ]).toMatchInlineSnapshot(`
      [
        {
          "label": "shared-foundation",
          "length": 52291,
          "lines": 1395,
          "sha256": "67f4aaa8ca31320efb647cf4285fcde6042db2dbc00a0c085ca99a904724068f",
        },
        {
          "label": "specialist-1",
          "length": 14066,
          "lines": 315,
          "sha256": "7d5ea4d36e38bcb479cbe72532d19ce777e8326f1f9878e57d9073fcd887ece0",
        },
        {
          "label": "specialist-2",
          "length": 11319,
          "lines": 306,
          "sha256": "3b226f924f836dbda34ac1274a2aea7384eb66473f93422dc2a29d938753d81e",
        },
        {
          "label": "specialist-3",
          "length": 8627,
          "lines": 246,
          "sha256": "c29ea01d64ab09fc03bdf503d0777c329a2da2e7d8fd5d1f54e096739c480cb8",
        },
        {
          "label": "specialist-4",
          "length": 9457,
          "lines": 261,
          "sha256": "f12f9ee4d9d3e0037d20fab5782623e9f786aacb2c7d9aad843411a578ad09b7",
        },
        {
          "label": "specialist-5",
          "length": 6809,
          "lines": 208,
          "sha256": "e2d7c2b649d95d76f665e207dbb0b274c4f901ab7dc0638831abd719b843a941",
        },
        {
          "label": "specialist-6",
          "length": 7794,
          "lines": 205,
          "sha256": "c93e4b3333d4f1791f76b25e1785705039ed8fa26767cde2ca1e1c0097651a5f",
        },
        {
          "label": "specialist-7",
          "length": 7977,
          "lines": 233,
          "sha256": "d2928cf952f3e3c2ce496088a5e25dbff3efa169b05b1cd21ef430aaec7da581",
        },
        {
          "label": "legacy-compatible-hidden-prompt",
          "length": 110721,
          "lines": 2962,
          "sha256": "6e5c1156641c61bbe99bd341f43f49e76d02761888fa9aafaa8b88d4135c4242",
        },
        {
          "label": "executive-full-hidden-prompt",
          "length": 119169,
          "lines": 3217,
          "sha256": "386a230124fd3339618c0c3558316c7690b58a5a9ed498c3a094b984c029ebcb",
        },
        {
          "label": "war-mode-minimal-hidden-prompt",
          "length": 111198,
          "lines": 2982,
          "sha256": "310b147d025f004e362ad681c549ae5d72bf3c0439e00b85de8d768e48523104",
        },
      ]
    `);
  });

  it('keeps the default export aligned with the stable named facade surface', () => {
    expect(megaPrompts.SHARED_FOUNDATION_BLOCK).toBe(SHARED_FOUNDATION_BLOCK);
    expect(megaPrompts.PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toBe(PROMPT_RAIO_X_OPERACIONAL_ATAQUE);
    expect(megaPrompts.PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toBe(PROMPT_TECH_STACK_GOD_MODE_ATAQUE);
    expect(megaPrompts.PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toBe(PROMPT_RISCOS_COMPLIANCE_GOD_MODE);
    expect(megaPrompts.PROMPT_RADAR_EXPANSAO_GOD_MODE).toBe(PROMPT_RADAR_EXPANSAO_GOD_MODE);
    expect(megaPrompts.PROMPT_RH_SINDICATOS_GOD_MODE).toBe(PROMPT_RH_SINDICATOS_GOD_MODE);
    expect(megaPrompts.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).toBe(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE);
    expect(megaPrompts.PROMPT_ORCAMENTO_JANELA_GOD_MODE).toBe(PROMPT_ORCAMENTO_JANELA_GOD_MODE);
    expect(megaPrompts.SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toBe(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT);
    expect(megaPrompts.buildLegacyCompatibleHiddenPrompt).toBe(buildLegacyCompatibleHiddenPrompt);
    expect(megaPrompts.PROMPT_VERSION).toBe(PROMPT_VERSION);
  });
});
