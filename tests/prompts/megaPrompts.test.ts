import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import megaPrompts, {
  ALL_SPECIALIST_PROMPTS,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_CAMINHO_DE_VENDA,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_VERSION,
  SELLER_BRIEF_MODULE_OUTPUT_CONTRACT,
  SHARED_FOUNDATION_BLOCK,
  PROMPT_TEIA_DEEP_MODULE,
  PROMPT_TEIA_IDENTITY_MODULE,
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

  it('requires parseable full CNPJ inventory for Teia instead of sampled totals', () => {
    expect(PROMPT_TEIA_IDENTITY_MODULE).not.toContain('Total de CNPJs mapeados');
    expect(PROMPT_TEIA_IDENTITY_MODULE).toContain('Total de CNPJs identificados com fonte');

    expect(PROMPT_TEIA_DEEP_MODULE).toContain('Liste TODOS OS CNPJs validos encontrados');
    expect(PROMPT_TEIA_DEEP_MODULE).not.toContain('Maximo 15 linhas');
    expect(PROMPT_TEIA_DEEP_MODULE).not.toContain('Mais [X] filiais/veiculos nao listados individualmente');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('**Empresas do Grupo Economico:**');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('**Outros CNPJs:**');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('Nao gere tabela textual de "Outros CNPJs onde o socio aparece"');
    expect(PROMPT_TEIA_DEEP_MODULE).not.toContain('| Socio | CNPJ | Razao Social | Fonte | Confianca | Escopo | Uso comercial |');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('OFICIAL qualifica o vinculo do socio, nao o vinculo do CNPJ com o grupo');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('CNPJ_LATERAL_SOCIO');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('CNPJ lateral nao sustenta tese operacional, enterprise, bioinsumos, verticalizacao ou wedge Senior');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('##.###.###/####-##*');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('* = hipótese a validar');

    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('CNPJ / Tipo');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('listar os 10 mais relevantes');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('NÃO gere tabela > 15 linhas');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('NÃO trunque nem amostre a tabela de CNPJs');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('Nao use CNPJ lateral do socio como prova de grupo economico ou verticalizacao');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('| CNPJ | Razão Social | Relação na Teia | CNAE / Papel | Fonte | Confiança |');
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
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('### Card: [título comercial]');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('**Pergunta de reunião:**');
    expect(SELLER_BRIEF_MODULE_OUTPUT_CONTRACT).toContain('CAMINHO DE VENDA');
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
          "length": 43400,
          "lines": 1034,
          "sha256": "bb98bdbf7ccb26df2f99d454175ac7ac9542b46334bc691c457edfcf2f90c50d",
        },
        {
          "label": "specialist-1",
          "length": 14018,
          "lines": 310,
          "sha256": "c21a33c2430578bf69b2890b230a897eaa3eb47d72511c8599f77257a6720a49",
        },
        {
          "label": "specialist-2",
          "length": 11440,
          "lines": 303,
          "sha256": "06772c628c5fdf523347679550606c9a35d5dd04400dbc2730b12511e94be28d",
        },
        {
          "label": "specialist-3",
          "length": 8690,
          "lines": 242,
          "sha256": "8b8ea45317d049bb7530cf21b2f8fca05757f5a9365ccc27013c9cc7ae2bfbb6",
        },
        {
          "label": "specialist-4",
          "length": 9474,
          "lines": 255,
          "sha256": "818eb30b08cf43234104be04361992b479e379aa69a46b73700dfd2f36b1d03e",
        },
        {
          "label": "specialist-5",
          "length": 6910,
          "lines": 204,
          "sha256": "bb2400b45b4475ed39bfc5ee2578c2c4f2b86b61b4a11b979e566a1a7eb8a201",
        },
        {
          "label": "specialist-6",
          "length": 7575,
          "lines": 198,
          "sha256": "3178184b5457ccdd9ad247da3f65a794ac7fb084b979d92e1a16ad43a17ac1ff",
        },
        {
          "label": "specialist-7",
          "length": 8433,
          "lines": 237,
          "sha256": "831fcf25b95289a753fc6003aee14ce2f5e846a1d949b321ca3aa5b66cd2050b",
        },
        {
          "label": "specialist-8",
          "length": 8458,
          "lines": 157,
          "sha256": "e543876d2251acc24e34232b7795b36fa3d1b2e54ade1de8d8b7b3711d99c2d7",
        },
        {
          "label": "legacy-compatible-hidden-prompt",
          "length": 110467,
          "lines": 2734,
          "sha256": "f05ac0ef0fd597f13dab9cdab68af5a1cf9d7e1651e93f02aad8d43148e84cce",
        },
        {
          "label": "executive-full-hidden-prompt",
          "length": 119368,
          "lines": 2993,
          "sha256": "689b39bd13c261066a00e0acbb3fb6353758e64d26cbeca214d14ed027162089",
        },
        {
          "label": "war-mode-minimal-hidden-prompt",
          "length": 110941,
          "lines": 2754,
          "sha256": "88f89c3935c000b518d12a5f9ce2a9f1ed5cc33b1e098de575ec81856e279812",
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
