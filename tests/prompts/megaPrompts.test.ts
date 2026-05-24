import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import megaPrompts, {
  ALL_SPECIALIST_PROMPTS,
  PROMPT_CAMINHO_DE_VENDA,
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
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('MAPAS + CARDS + ARMA DE VENDA UNIFICADA');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('Não gere seção "Brief de Reunião"');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('## Mapas Visuais');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('## Cards de Auditoria');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('CAMINHO DE VENDA');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('Scripts por Persona');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('Mapa da Estratégia de Entrada');
    expect(SHARED_FOUNDATION_BLOCK).toContain(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT);
  });

  it('keeps the facade metadata and specialist prompt collection stable', () => {
    expect(PROMPT_VERSION).toBe('Scout360_v5.0_ExecutiveCommitteeGrade');
    expect(ALL_SPECIALIST_PROMPTS).toHaveLength(8);
    expect(new Set(ALL_SPECIALIST_PROMPTS).size).toBe(ALL_SPECIALIST_PROMPTS.length);
    expect(ALL_SPECIALIST_PROMPTS).toEqual([
      PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
      PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
      PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
      PROMPT_RADAR_EXPANSAO_GOD_MODE,
      PROMPT_RH_SINDICATOS_GOD_MODE,
      PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
      PROMPT_ORCAMENTO_JANELA_GOD_MODE,
      PROMPT_CAMINHO_DE_VENDA,
    ]);
  });

  it('keeps the legacy-compatible builder output stable through the facade', () => {
    const prompt = buildLegacyCompatibleHiddenPrompt({
      companyName: 'Fazenda Modelo',
      cnpj: '12.345.678/0001-99',
      city: 'Cuiaba',
      state: 'MT',
    });

    expect(prompt).toContain('INVESTIGACAO_COMPLETA_INTEGRADA (MVP+ v6):');
    expect(prompt).toContain('ANTES DE TUDO: valide a identidade');
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
          "length": 38721,
          "lines": 941,
          "sha256": "2f36f9517e32ab7c06074c422fa962c4bea9c222789c63b73aeddcf179837071",
        },
        {
          "label": "specialist-1",
          "length": 13796,
          "lines": 315,
          "sha256": "08e9b1275454900b728bb1ab689bad769af37b5bca153290570b314f1589334c",
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
          "length": 8808,
          "lines": 254,
          "sha256": "a40084ee4abaa1b6d89df19c59d2491f68364a206e050471c0140118141b9046",
        },
        {
          "label": "specialist-5",
          "length": 6809,
          "lines": 208,
          "sha256": "e2d7c2b649d95d76f665e207dbb0b274c4f901ab7dc0638831abd719b843a941",
        },
        {
          "label": "specialist-6",
          "length": 7445,
          "lines": 201,
          "sha256": "5353ab6f8f60e052f82239375ce51bdd0d1c7471b7f532d567a7a25669201784",
        },
        {
          "label": "specialist-7",
          "length": 7977,
          "lines": 233,
          "sha256": "d2928cf952f3e3c2ce496088a5e25dbff3efa169b05b1cd21ef430aaec7da581",
        },
        {
          "label": "specialist-8",
          "length": 7485,
          "lines": 144,
          "sha256": "a44057521cd1b7d8b8b0889cd5adcea9fbd55956048a0aa074449c1aae1100c2",
        },
        {
          "label": "legacy-compatible-hidden-prompt",
          "length": 103512,
          "lines": 2646,
          "sha256": "4672a94068805bdf7e894e456e7b74e68a57a84c065aadb7c69fa9c8e350c4fd",
        },
        {
          "label": "executive-full-hidden-prompt",
          "length": 111957,
          "lines": 2901,
          "sha256": "6a55cbd059f29c7f6673bd16528671c507168215f44164cfb00c81008514eeb3",
        },
        {
          "label": "war-mode-minimal-hidden-prompt",
          "length": 103986,
          "lines": 2666,
          "sha256": "605712d9c74b2255b6d4c80b1550e1334a49cf9295ef2a69f07b34c11baa4a7b",
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
