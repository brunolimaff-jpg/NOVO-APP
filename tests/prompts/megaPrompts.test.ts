import { describe, expect, it } from 'vitest';
import { loadBuilders, loadFoundationBlocks, loadSpecialistPrompts } from '../../prompts/megaPrompts';

describe('PORTA mega prompts', () => {
  it('keeps each deep dive framed as a specialist module instead of a full dossier rewrite', async () => {
    const sp = await loadSpecialistPrompts();
    expect(sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toContain('<system_context>');
    expect(sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toContain('<system_context>');
    expect(sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toContain('<system_context>');
    expect(sp.PROMPT_RADAR_EXPANSAO_GOD_MODE).toContain('<system_context>');
    expect(sp.PROMPT_RH_SINDICATOS_GOD_MODE).toContain('<system_context>');
    expect(sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).toContain('<system_context>');
  });

  it('includes feed markers in the operational prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const op = sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE;
    expect(op).toContain('[[PORTA_FEED_O:[NOTA]:ELOS:[LISTA_ELOS]]]');
    expect(op).toContain('[[PORTA_FLAG:NOFIT:[SIM/NAO]]]');
  });

  it('strengthens the operational prompt for pecuaria, frota and ESG signals', async () => {
    const sp = await loadSpecialistPrompts();
    const op = sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE;
    expect(op).toContain('Peccode');
    expect(op).toContain('Multibovinos');
    expect(op).toContain('PRO Carbono');
    expect(op).toContain('hidrel\u00e9trica');
    expect(op).toContain(
      'N\u00c3O ative NOFIT para empresas que combinam pecu\u00e1ria com agr\u00edcola',
    );
  });

  it('keeps only T markers in the tech stack prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const tech = sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE;
    expect(tech).toContain('[[PORTA_FEED_T:[NOTA_FINAL]:T1:[NOTA]:T2:[NOTA]:T3:[NOTA]:STACK:[ERP_IDENTIFICADO]]]');
    expect(tech).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('flags Delphi and other legacy languages as strong tech debt signals', async () => {
    const sp = await loadSpecialistPrompts();
    const tech = sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE;
    expect(tech).toContain('Desenvolvedor Delphi');
    expect(tech).toContain('Analista Clipper');
    expect(tech).toContain('Visual Basic');
    expect(tech).toContain('FoxPro');
    expect(tech).toContain('\u26a0\ufe0f SINAL DE SISTEMA LEGADO');
  });

  it('includes R and TRAD markers in the compliance prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const comp = sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE;
    expect(comp).toContain('[[PORTA_FEED_R:[NOTA]:PRESSOES:[LISTA]]]');
    expect(comp).toContain('[[PORTA_FLAG:TRAD:[SIM/NAO]:NATUREZA:[PRODUCAO/TRADING/MISTA]]]');
  });

  it('treats originacao plus producao as opportunity instead of TRAD penalty', async () => {
    const sp = await loadSpecialistPrompts();
    const comp = sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE;
    expect(comp).toContain('Empresa que produz E faz origina\u00e7\u00e3o = MISTA \u2192 TRAD = NAO');
    expect(comp).toContain('ABNT');
    expect(comp).toContain('PRO Carbono');
    expect(comp).toContain('CONTRAPESOS DE COMPLIANCE E GOVERNAN\u00c7A');
  });

  it('includes P and segment markers in the expansion prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const exp = sp.PROMPT_RADAR_EXPANSAO_GOD_MODE;
    expect(exp).toContain('[[PORTA_FEED_P:[NOTA]:HA:[HECTARES]:CNPJS:[TOTAL]:FAT:[FATURAMENTO]]]');
    expect(exp).toContain('[[PORTA_SEG:[PRD/AGI/COP]]]');
    expect(exp).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('uses the stricter COP -> AGI -> PRD segment logic and diversified verticals', async () => {
    const sp = await loadSpecialistPrompts();
    const exp = sp.PROMPT_RADAR_EXPANSAO_GOD_MODE;
    expect(exp).toContain('COP > AGI > PRD');
    expect(exp).toContain('\u00c9 cooperativa agr\u00edcola? \u2192 COP');
    expect(exp).toContain('mais de 3 verticais');
    expect(exp).toContain('energia');
    expect(exp).toContain('piscicultura');
  });

  it('includes P proxy, R trabalhista and A2 markers in the RH prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const rh = sp.PROMPT_RH_SINDICATOS_GOD_MODE;
    expect(rh).toContain('[[PORTA_FEED_P_PROXY:FUNC:[TOTAL_FUNCIONARIOS]]]');
    expect(rh).toContain('[[PORTA_FEED_R_TRAB:[NOTA]:PASSIVOS:[LISTA]]]');
    expect(rh).toContain('[[PORTA_FEED_A2:[NOTA]:TIMING:[BOM/NEUTRO/RUIM]:FASE:[FASE_ATUAL]]]');
  });

  it('includes only A markers in the decisor prompt', async () => {
    const sp = await loadSpecialistPrompts();
    const dec = sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE;
    expect(dec).toContain('[[PORTA_FEED_A:[NOTA_FINAL]:A1:[NOTA]:A2:[NOTA]:GERACAO:[G1/G2/PROF]]]');
    expect(dec).not.toContain('[[PORTA_FLAG:LOCK:[SIM/NAO]]]');
  });

  it('keeps PORTA as an internal layer instead of visible scoring language in module outputs', async () => {
    const sp = await loadSpecialistPrompts();
    expect(sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE).not.toContain('### \ud83d\udcca BLOCO DE FEEDS PORTA');
    expect(sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE).not.toContain('Nota O sugerida');
    expect(sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE).not.toContain('Nota T2 sugerida');
    expect(sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE).not.toContain('NOTA T FINAL');
    expect(sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE).not.toContain('### \ud83d\udcca BLOCO DE FEEDS PORTA');
    expect(sp.PROMPT_RADAR_EXPANSAO_GOD_MODE).not.toContain('Nota P sugerida');
    expect(sp.PROMPT_RH_SINDICATOS_GOD_MODE).not.toContain('Nota A2 sugerida');
    expect(sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).not.toContain('Nota A1 sugerida');
  });

  it('keeps the facade metadata and specialist prompt collection stable', async () => {
    const sp = await loadSpecialistPrompts();
    const b = await loadBuilders();
    expect(b.PROMPT_VERSION).toBe('Scout360_v5.0_ExecutiveCommitteeGrade');
    const allPrompts = [
      sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
      sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
      sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
      sp.PROMPT_RADAR_EXPANSAO_GOD_MODE,
      sp.PROMPT_RH_SINDICATOS_GOD_MODE,
      sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
      sp.PROMPT_ORCAMENTO_JANELA_GOD_MODE,
    ];
    expect(allPrompts).toHaveLength(7);
    expect(new Set(allPrompts).size).toBe(7);
  });

  it('keeps the legacy-compatible builder output stable through the facade', async () => {
    const sp = await loadSpecialistPrompts();
    const blocks = await loadFoundationBlocks();
    const b = await loadBuilders();

    const prompt = b.buildLegacyCompatibleHiddenPrompt({
      companyName: 'Fazenda Modelo',
      cnpj: '12.345.678/0001-99',
      city: 'Cuiaba',
      state: 'MT',
    });

    expect(prompt).toContain('INVESTIGACAO_COMPLETA_INTEGRADA (MVP+):');
    expect(prompt).toContain('Empresa=Fazenda Modelo; CNPJ=12.345.678/0001-99; Cidade=Cuiaba; UF=MT.');
    expect(prompt).toContain(blocks.SHARED_FOUNDATION_BLOCK);
    expect(prompt).toContain(sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE);
    expect(prompt).toContain(sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE);
    expect(prompt).not.toContain(sp.PROMPT_ORCAMENTO_JANELA_GOD_MODE);
  });

  it('keeps the default export aligned with the stable named facade surface', async () => {
    const sp = await loadSpecialistPrompts();
    const blocks = await loadFoundationBlocks();
    const b = await loadBuilders();

    // b.SHARED_FOUNDATION_BLOCK = concatenation of all 15 foundation blocks (from builders.ts)
    // blocks.SHARED_FOUNDATION_BLOCK = just the V5 core governance block (from foundation.ts)
    expect(b.SHARED_FOUNDATION_BLOCK).toContain(blocks.SHARED_FOUNDATION_BLOCK);
    expect(sp.PROMPT_RAIO_X_OPERACIONAL_ATAQUE).toBeTruthy();
    expect(sp.PROMPT_TECH_STACK_GOD_MODE_ATAQUE).toBeTruthy();
    expect(sp.PROMPT_RISCOS_COMPLIANCE_GOD_MODE).toBeTruthy();
    expect(sp.PROMPT_RADAR_EXPANSAO_GOD_MODE).toBeTruthy();
    expect(sp.PROMPT_RH_SINDICATOS_GOD_MODE).toBeTruthy();
    expect(sp.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE).toBeTruthy();
    expect(sp.PROMPT_ORCAMENTO_JANELA_GOD_MODE).toBeTruthy();
    expect(b.buildLegacyCompatibleHiddenPrompt).toBeTruthy();
    expect(b.PROMPT_VERSION).toBeTruthy();
  });
});
