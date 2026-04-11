import { describe, it, expect } from 'vitest';
import { cleanPortaFeedMarkers, parseMarkers, parsePortaFeeds } from '../../services/geminiService';

describe('parseMarkers — PORTA', () => {
  it('parses v2 marker with AGI segment and no flags', () => {
    const content = 'Some text [[PORTA:84:P8:O10:R7:T8:A8:AGI:NONE]] more text';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.score).toBe(84);
    expect(result.scorePorta!.p).toBe(8);
    expect(result.scorePorta!.o).toBe(10);
    expect(result.scorePorta!.r).toBe(7);
    expect(result.scorePorta!.t).toBe(8);
    expect(result.scorePorta!.a).toBe(8);
    expect(result.scorePorta!.segmento).toBe('AGI');
    expect(result.scorePorta!.flags).toEqual([]);
    expect(result.scorePorta!.scoreBruto).toBeDefined();
    expect(result.text).not.toContain('[[PORTA');
  });

  it('parses v2 marker with PRD segment and TRAD flag', () => {
    const content = '[[PORTA:51:P7:O8:R6:T7:A7:PRD:TRAD]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.score).toBe(43);
    expect(result.scorePorta!.segmento).toBe('PRD');
    expect(result.scorePorta!.flags).toEqual(['TRAD']);
  });

  it('ignores legacy LOCK in v2 markers and recomputes the score', () => {
    const content = '[[PORTA:21:P6:O7:R5:T5:A6:PRD:TRAD,LOCK]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.score).toBe(35);
    expect(result.scorePorta!.flags).toEqual(['TRAD']);
  });

  it('parses v2 marker with COP segment and NOFIT flag', () => {
    const content = '[[PORTA:18:P5:O4:R6:T5:A5:COP:NOFIT]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.segmento).toBe('COP');
    expect(result.scorePorta!.flags).toEqual(['NOFIT']);
  });

  it('parses v2 marker with all three flags', () => {
    const content = '[[PORTA:9:P6:O7:R5:T5:A6:PRD:TRAD,LOCK,NOFIT]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.score).toBe(11);
    expect(result.scorePorta!.flags).toEqual(['TRAD', 'NOFIT']);
  });

  it('calculates scoreBruto for PRD segment', () => {
    const content = '[[PORTA:68:P5:O4:R3:T9:A9:PRD:NONE]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    // PRD weights: p=0.10, o=0.25, r=0.10, t=0.30, a=0.25
    // (5*0.10 + 4*0.25 + 3*0.10 + 9*0.30 + 9*0.25) * 10
    // = (0.5 + 1.0 + 0.3 + 2.7 + 2.25) * 10 = 67.5 → 68
    expect(result.scorePorta!.scoreBruto).toBe(68);
  });

  it('falls back to v1 parsing for legacy markers', () => {
    const content = '[[PORTA:75:P8:O7:R8:T7:A7]]';
    const result = parseMarkers(content);
    expect(result.scorePorta).not.toBeNull();
    expect(result.scorePorta!.score).toBe(75);
    expect(result.scorePorta!.p).toBe(8);
    expect(result.scorePorta!.segmento).toBe('PRD');
    expect(result.scorePorta!.flags).toEqual([]);
    expect(result.scorePorta!.scoreBruto).toBeUndefined();
  });

  it('returns null when no PORTA marker exists', () => {
    const content = 'Just some regular text without markers';
    const result = parseMarkers(content);
    expect(result.scorePorta).toBeNull();
  });

  it('consolidates PORTA feed markers when final marker is absent', () => {
    const content = `
Resumo executivo.
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
[[PORTA_FLAG:NOFIT:[NAO]]]
Fim do resumo.
    `;
    const result = parseMarkers(content);

    expect(result.scorePorta).toEqual({
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
    expect(result.text).not.toContain('PORTA_FEED');
    expect(result.text).toContain('Resumo executivo.');
    expect(result.text).toContain('Fim do resumo.');
  });

  it('strips v2 marker from text output', () => {
    const content = 'Before [[PORTA:84:P8:O10:R7:T8:A8:AGI:NONE]] After';
    const result = parseMarkers(content);
    expect(result.text).not.toContain('PORTA');
    expect(result.text).toContain('Before');
    expect(result.text).toContain('After');
  });

  it('parses PORTA_FEED markers from deep dive output', () => {
    const content = `
[[PORTA_FEED_T:[8]:T1:[9]:T2:[3]:T3:[9]:STACK:[Senior]]]
[[PORTA_FEED_A:[8]:A1:[9]:A2:[7]:GERACAO:[G2]]]
[[PORTA_FLAG:LOCK:[NAO]]]
[[PORTA_SEG:[AGI]]]
    `;
    const feeds = parsePortaFeeds(content, 'TECH_STACK');

    expect(feeds.adjustments.some(a => a.dimension === 'T' && a.suggestedValue === 8)).toBe(true);
    expect(feeds.adjustments.some(a => a.dimension === 'A' && a.suggestedValue === 8)).toBe(true);
    expect(feeds.flags).toEqual([]);
    expect(feeds.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'TECH_STACK',
          segmento: 'AGI',
        }),
      ]),
    );
  });

  it('cleans feed markers from visible content', () => {
    const raw = `
Análise detalhada.
[[PORTA_FEED_O:[8]:ELOS:[plantio,armazenagem]]]
[[PORTA_FLAG:TRAD:[NAO]]]
[[PORTA_SEG:[PRD]]]
Fim.
    `;
    const cleaned = cleanPortaFeedMarkers(raw);
    expect(cleaned).toContain('Análise detalhada.');
    expect(cleaned).toContain('Fim.');
    expect(cleaned).not.toContain('PORTA_FEED');
    expect(cleaned).not.toContain('PORTA_FLAG');
    expect(cleaned).not.toContain('PORTA_SEG');
  });
});
