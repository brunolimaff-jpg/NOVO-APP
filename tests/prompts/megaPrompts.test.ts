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
          "length": 42760,
          "lines": 1027,
          "sha256": "b01057ba9c360a320b9c40de6f82d086b1cc3e5ab6bc55e00b8ebeb235947da0",
        },
        {
          "label": "specialist-1",
          "length": 13381,
          "lines": 301,
          "sha256": "33e3a228cda74e7bb3fe2cc27cf4f9807bcda9dc69c6f956e0f3d94300ffe961",
        },
        {
          "label": "specialist-2",
          "length": 10803,
          "lines": 294,
          "sha256": "55adbd05da55e39f9f563a246bbd8514e9b976411ccc7fa05d53c55b75f5a045",
        },
        {
          "label": "specialist-3",
          "length": 8053,
          "lines": 233,
          "sha256": "dc85631955166a42489a9137e3a766aa2c7a53e61a4f011e947b393357992eda",
        },
        {
          "label": "specialist-4",
          "length": 8837,
          "lines": 246,
          "sha256": "179ceb0343a8aeed08ab1c678da70f80d8db0ee105b8647cc8651e84d7ad04ca",
        },
        {
          "label": "specialist-5",
          "length": 6273,
          "lines": 195,
          "sha256": "87bce7d8c79e8ff6087e17d7542907b96ac32d2dd09202f6e003bae64c165472",
        },
        {
          "label": "specialist-6",
          "length": 6938,
          "lines": 189,
          "sha256": "05834c1fb329c314d4b6fa192e7b46be41cc7949d7b18f13004e68290b91669d",
        },
        {
          "label": "specialist-7",
          "length": 7796,
          "lines": 228,
          "sha256": "5e20b6b2357264a0d19ac55af8a3bf981f2091d97a9489e82f17965e8071b4fd",
        },
        {
          "label": "specialist-8",
          "length": 7821,
          "lines": 148,
          "sha256": "8fff981db22b5ad7ad18ad225be955d38a4d569a4b4880d1bd25aae0293a5599",
        },
        {
          "label": "legacy-compatible-hidden-prompt",
          "length": 105368,
          "lines": 2664,
          "sha256": "85597e90a4221a7ad200420a5937c37ac9bb117567b0c3c32741f57e95b6b63c",
        },
        {
          "label": "executive-full-hidden-prompt",
          "length": 113632,
          "lines": 2914,
          "sha256": "4da98f3289527141f0de2d2277f0d1953c87a91be8d8950b881e64c351a23ae0",
        },
        {
          "label": "war-mode-minimal-hidden-prompt",
          "length": 105842,
          "lines": 2684,
          "sha256": "7e9e622432e32a7df1ad4f627c39e72f75c7a9553c7a5dac6a4de9d0339f3c54",
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
