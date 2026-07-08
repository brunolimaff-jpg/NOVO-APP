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
    expect(PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('CONTRAPESOS DE COMPLIANCE E GOVERNAN\u00c7A');
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
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('\u00c9 cooperativa agr\u00edcola? \u2192 COP');
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
    expect(PROMPT_TEIA_DEEP_MODULE).not.toContain(
      '| Socio | CNPJ | Razao Social | Fonte | Confianca | Escopo | Uso comercial |',
    );
    expect(PROMPT_TEIA_DEEP_MODULE).toContain(
      'OFICIAL qualifica o vinculo do socio, nao o vinculo do CNPJ com o grupo',
    );
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('CNPJ_LATERAL_SOCIO');
    expect(PROMPT_TEIA_DEEP_MODULE).toContain(
      'CNPJ lateral nao sustenta tese operacional, enterprise, bioinsumos, verticalizacao ou wedge Senior',
    );
    expect(PROMPT_TEIA_DEEP_MODULE).toContain('##.###.###/####-##*');
    expect(PROMPT_TEIA_DEEP_MODULE).not.toContain('* = hipótese a validar');

    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('CNPJ / Tipo');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('listar os 10 mais relevantes');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('NÃO gere tabela > 15 linhas');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('NÃO trunque nem amostre a tabela de CNPJs');
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain(
      'Nao use CNPJ lateral do socio como prova de grupo economico ou verticalizacao',
    );
    expect(PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain(
      '| CNPJ | Razão Social | Relação na Teia | CNAE / Papel | Fonte | Confiança |',
    );
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

  it('nao contem caracteres CJK acidentais nos prompts principais', () => {
    const promptBundle = [SHARED_FOUNDATION_BLOCK, SELLER_BRIEF_MODULE_OUTPUT_CONTRACT, ...ALL_SPECIALIST_PROMPTS].join(
      '\n',
    );

    expect(promptBundle).not.toMatch(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u);
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
        buildInvestigationHiddenPrompt(
          {
            companyName: 'Cooperativa Horizonte',
            cnpj: undefined,
            city: '',
            state: 'PR',
          },
          {
            includeBudget: false,
            mode: 'warMode',
            strictAudit: false,
            enableDiscrepancyHunter: false,
            enableCostOfDelay: false,
          },
        ),
      ),
    ]).toMatchInlineSnapshot(`
      [
        {
          "label": "shared-foundation",
          "length": 43719,
          "lines": 1037,
          "sha256": "825b122f779b47d1017e19307fe45b08f4cfddc0ebe5269ac7332160fb910c9c",
        },
        {
          "label": "specialist-1",
          "length": 13988,
          "lines": 310,
          "sha256": "08a6020fdb0e241badeec7baad36637116abafc20be9e307826e08ea583855a6",
        },
        {
          "label": "specialist-2",
          "length": 11410,
          "lines": 303,
          "sha256": "86ca64bb481ef420ac588e687fe3e1ede7b52aee6e814d9f8da1ce820f34157e",
        },
        {
          "label": "specialist-3",
          "length": 8660,
          "lines": 242,
          "sha256": "fd5c64eb8d792211582de3857011f6a7a2d81ef21f7a4dae566e3f7a4917ec02",
        },
        {
          "label": "specialist-4",
          "length": 9444,
          "lines": 255,
          "sha256": "9125f8eca80b6f0eed8f43655ba195c3ed52028e96426e3a3d8e8c2064c30278",
        },
        {
          "label": "specialist-5",
          "length": 6880,
          "lines": 204,
          "sha256": "b7172ac6af797db405d7f8d856dce1fc71a7dd69197bad8e4d6936795f675afa",
        },
        {
          "label": "specialist-6",
          "length": 7545,
          "lines": 198,
          "sha256": "660a3b4132104e2e842af5fa211da31f1d678d78b3947f5b0c0fd413f0ea8d07",
        },
        {
          "label": "specialist-7",
          "length": 8403,
          "lines": 237,
          "sha256": "ad17c59034cc71924051b5b39368f40aa4477afa2865888f9939d72d92d311bb",
        },
        {
          "label": "specialist-8",
          "length": 8428,
          "lines": 157,
          "sha256": "f9e6ab8286e4f50279738831877d17290e97b04510b4812b21f02a959428b963",
        },
        {
          "label": "legacy-compatible-hidden-prompt",
          "length": 110576,
          "lines": 2737,
          "sha256": "5c0dc5bdecb49a12b247a8ef26430e5d4368190b22e34eaaa090ae636ac5b9a7",
        },
        {
          "label": "executive-full-hidden-prompt",
          "length": 119447,
          "lines": 2996,
          "sha256": "8145571207e0d326f2523f00e0e52087e1ffb41b1c3d09ce81c2aa3c2745c790",
        },
        {
          "label": "war-mode-minimal-hidden-prompt",
          "length": 111050,
          "lines": 2757,
          "sha256": "012b9dc5ac1916a6662207ab9b8e6a40ecd83a6b45623d49d80545b8dd462e4c",
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
