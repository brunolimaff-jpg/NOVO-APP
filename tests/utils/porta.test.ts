import { describe, expect, it } from 'vitest';
import {
  buildPortaScoreFromFeeds,
  calculatePortaFlagMultiplier,
  calculatePortaScoreBruto,
  parsePortaMarkerV2,
  resolvePortaScore,
  stripPortaMarkers,
} from '../../utils/porta';

describe('PORTA helpers', () => {
  it('parses a v2 marker with segment, flags and score bruto', () => {
    const parsed = parsePortaMarkerV2('[[PORTA:51:P7:O8:R6:T7:A7:PRD:TRAD]]');

    expect(parsed).toEqual({
      score: 51,
      p: 7,
      o: 8,
      r: 6,
      t: 7,
      a: 7,
      segmento: 'PRD',
      flags: ['TRAD'],
      scoreBruto: 72,
    });
  });

  it('keeps backward compatibility with v1 markers', () => {
    const parsed = parsePortaMarkerV2('[[PORTA:68:P5:O4:R3:T9:A9]]');

    expect(parsed).toEqual({
      score: 68,
      p: 5,
      o: 4,
      r: 3,
      t: 9,
      a: 9,
      segmento: 'PRD',
      flags: [],
    });
  });

  it('strips raw markers from mixed text', () => {
    expect(stripPortaMarkers('Antes [[PORTA:45:P9:O9:R8:T6:A5:AGI:LOCK]] depois')).toBe('Antes  depois');
  });

  it('removes the visible PORTA feed block while preserving the narrative above it', () => {
    const cleaned = stripPortaMarkers([
      'Texto principal do módulo.',
      '',
      '### 📊 BLOCO DE FEEDS PORTA',
      '',
      '**Dimensão O — Cadeia de Valor:**',
      '- Nota O sugerida: 9',
      '[[PORTA_FEED_O:9:ELOS:Plantio,Armazenagem]]',
      '',
      '# Próximo módulo',
      'Continua aqui.',
    ].join('\n'));

    expect(cleaned).toContain('Texto principal do módulo.');
    expect(cleaned).toContain('# Próximo módulo');
    expect(cleaned).not.toContain('BLOCO DE FEEDS PORTA');
    expect(cleaned).not.toContain('Nota O sugerida');
  });

  it('builds score from consolidated feed markers for a large agroindustrial group', () => {
    const parsed = buildPortaScoreFromFeeds(`
[[PORTA_FEED_O:[8]:ELOS:[Plantio,Armazenagem,Beneficiamento,Exportacao,Logistica]]]
[[PORTA_FEED_R:[7]:PRESSOES:[Licenca ambiental,GlobalGAP]]]
[[PORTA_FEED_R:[6]:PRESSOES:[ICMS,IBS/CBS]]]
[[PORTA_FEED_T:[8]:T1:[7]:T2:[8]:T3:[9]:STACK:[TOTVS]]]
[[PORTA_FEED_P:[8]:HA:[30000]:CNPJS:[12]:FAT:[R$ 2 bi]]]
[[PORTA_FEED_P_PROXY:FUNC:[2500]]]
[[PORTA_FEED_R_TRAB:[5]:PASSIVOS:[Horas extras]]]
[[PORTA_FEED_A2:[7]:TIMING:[NEUTRO]:FASE:[Planejamento]]]
[[PORTA_FEED_A:[8]:A1:[8]:A2:[7]:GERACAO:[G2]]]
[[PORTA_SEG:[AGI]]]
[[PORTA_FLAG:TRAD:[NAO]:NATUREZA:[PRODUCAO]]]
[[PORTA_FLAG:LOCK:[NAO]]]
[[PORTA_FLAG:NOFIT:[NAO]]]
    `);

    expect(parsed).toEqual({
      score: 76,
      p: 8,
      o: 8,
      r: 6,
      t: 8,
      a: 8,
      segmento: 'AGI',
      flags: [],
      scoreBruto: 76,
    });
  });

  it('applies trading and lock penalties when feed flags are active', () => {
    const parsed = buildPortaScoreFromFeeds(`
[[PORTA_FEED_O:[4]:ELOS:[Comercializacao]]]
[[PORTA_FEED_R:[6]:PRESSOES:[SEFAZ]]]
[[PORTA_FEED_R_TRAB:[4]:PASSIVOS:[MPT]]]
[[PORTA_FEED_T:[3]:T1:[6]:T2:[2]:T3:[1]:STACK:[SAP]]]
[[PORTA_FEED_P:[7]:HA:[0]:CNPJS:[9]:FAT:[R$ 1,1 bi]]]
[[PORTA_FEED_P_PROXY:FUNC:[120]]]
[[PORTA_FEED_A2:[3]:TIMING:[RUIM]:FASE:[Colheita]]]
[[PORTA_FEED_A:[4]:A1:[5]:A2:[3]:GERACAO:[PROF]]]
[[PORTA_SEG:[PRD]]]
[[PORTA_FLAG:TRAD:[SIM]:NATUREZA:[TRADING]]]
[[PORTA_FLAG:LOCK:[SIM]]]
[[PORTA_FLAG:NOFIT:[NAO]]]
    `);

    expect(parsed).toEqual({
      score: 12,
      p: 6,
      o: 4,
      r: 5,
      t: 3,
      a: 4,
      segmento: 'PRD',
      flags: ['TRAD', 'LOCK'],
      scoreBruto: 40,
    });
  });

  it('keeps a medium farm in PRD with balanced proxy inputs', () => {
    const parsed = buildPortaScoreFromFeeds(`
[[PORTA_FEED_O:[6]:ELOS:[Plantio,Armazenagem,Beneficiamento]]]
[[PORTA_FEED_R:[4]:PRESSOES:[LCDPR]]]
[[PORTA_FEED_T:[6]:T1:[5]:T2:[6]:T3:[7]:STACK:[Planilhas]]]
[[PORTA_FEED_P:[6]:HA:[8500]:CNPJS:[4]:FAT:[R$ 180 mi]]]
[[PORTA_FEED_P_PROXY:FUNC:[650]]]
[[PORTA_FEED_A2:[8]:TIMING:[BOM]:FASE:[Entressafra]]]
[[PORTA_FEED_A:[6]:A1:[5]:A2:[6]:GERACAO:[G1_5]]]
[[PORTA_SEG:[PRD]]]
[[PORTA_FLAG:TRAD:[NAO]:NATUREZA:[PRODUCAO]]]
[[PORTA_FLAG:LOCK:[NAO]]]
[[PORTA_FLAG:NOFIT:[NAO]]]
    `);

    expect(parsed).toEqual({
      score: 58,
      p: 6,
      o: 6,
      r: 4,
      t: 6,
      a: 6,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 58,
    });
  });

  it('calculates weights and penalties consistently', () => {
    expect(calculatePortaScoreBruto(9, 9, 8, 6, 5, 'AGI')).toBe(76);
    expect(calculatePortaFlagMultiplier(['TRAD', 'LOCK'])).toBe(0.3);
  });

  it('resolves a waterfall score from feed markers when the explicit marker is absent', () => {
    const resolved = resolvePortaScore(`
[[PORTA_FEED_O:[8]:ELOS:[Plantio,Armazenagem,Beneficiamento,Exportacao,Logistica]]]
[[PORTA_FEED_R:[7]:PRESSOES:[Licenca ambiental,GlobalGAP]]]
[[PORTA_FEED_R:[6]:PRESSOES:[ICMS,IBS/CBS]]]
[[PORTA_FEED_T:[8]:T1:[7]:T2:[8]:T3:[9]:STACK:[TOTVS]]]
[[PORTA_FEED_P:[8]:HA:[30000]:CNPJS:[12]:FAT:[R$ 2 bi]]]
[[PORTA_FEED_P_PROXY:FUNC:[2500]]]
[[PORTA_FEED_R_TRAB:[5]:PASSIVOS:[Horas extras]]]
[[PORTA_FEED_A2:[7]:TIMING:[NEUTRO]:FASE:[Planejamento]]]
[[PORTA_FEED_A:[8]:A1:[8]:A2:[7]:GERACAO:[G2]]]
[[PORTA_SEG:[AGI]]]
[[PORTA_FLAG:TRAD:[NAO]:NATUREZA:[PRODUCAO]]]
[[PORTA_FLAG:LOCK:[NAO]]]
[[PORTA_FLAG:NOFIT:[NAO]]]
    `);

    expect(resolved.source).toBe('feeds');
    expect(resolved.missingDimensions).toEqual([]);
    expect(resolved.score).toEqual({
      score: 76,
      p: 8,
      o: 8,
      r: 6,
      t: 8,
      a: 8,
      segmento: 'AGI',
      flags: [],
      scoreBruto: 76,
    });
  });

  it('returns missing dimensions when the waterfall feed set is incomplete', () => {
    const resolved = resolvePortaScore(`
[[PORTA_FEED_O:[8]:ELOS:[Plantio,Armazenagem,Beneficiamento]]]
[[PORTA_FEED_R:[6]:PRESSOES:[SEFAZ]]]
[[PORTA_FEED_P:[7]:HA:[12000]:CNPJS:[4]:FAT:[R$ 300 mi]]]
[[PORTA_FEED_A2:[7]:TIMING:[BOM]:FASE:[Entressafra]]]
[[PORTA_SEG:[PRD]]]
    `);

    expect(resolved.score).toBeNull();
    expect(resolved.source).toBe('feeds');
    expect(resolved.missingDimensions).toEqual(['T']);
  });
});
