import { describe, it, expect } from 'vitest';
import { ALL_SPECIALIST_PROMPTS } from '../../prompts/mega/builders';
import { ALL_SPECIALIST_PROMPTS_V2 } from '../../prompts/mega/specialist-prompts-v2';
import { PROMPT_TEIA_IDENTITY_MODULE } from '../../prompts/mega/teia-identity';
import { PROMPT_TEIA_IDENTITY_MODULE_V2 } from '../../prompts/mega/teia-identity-v2';

const PORTA_REGEXES = [
  /\[\[PORTA_FEED_O:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_R:[^\]]+\]\]/g,
  /\[\[PORTA_FLAG:NOFIT:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_T:[^\]]+\]\]/g,
  /\[\[PORTA_FLAG:TRAD:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_P:[^\]]+\]\]/g,
  /\[\[PORTA_SEG:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_P_PROXY:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_R_TRAB:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_A2:[^\]]+\]\]/g,
  /\[\[PORTA_FEED_A:[^\]]+\]\]/g,
];

function extractMarkers(prompt: string): string[] {
  const all: string[] = [];
  for (const regex of PORTA_REGEXES) {
    const matches = prompt.match(regex) || [];
    all.push(...matches);
  }
  return all.sort();
}

function extractInlineCitationBlock(prompt: string): string | null {
  return prompt.match(/<inline_citation_rule>[\s\S]*?<\/inline_citation_rule>/)?.[0] || null;
}

describe('Parser contract — v1 vs v2 markers idênticos', () => {
  it('ALL_SPECIALIST_PROMPTS tem mesmo length que V2', () => {
    expect(ALL_SPECIALIST_PROMPTS_V2.length).toBe(ALL_SPECIALIST_PROMPTS.length);
  });

  ALL_SPECIALIST_PROMPTS.forEach((promptV1, i) => {
    const promptV2 = ALL_SPECIALIST_PROMPTS_V2[i];

    it('specialist prompt ' + i + ': markers PORTA idênticos', () => {
      const v1Markers = extractMarkers(promptV1);
      const v2Markers = extractMarkers(promptV2);
      expect(v2Markers).toEqual(v1Markers);
    });

    it('specialist prompt ' + i + ': bloco <inline_citation_rule> idêntico', () => {
      const v1Block = extractInlineCitationBlock(promptV1);
      const v2Block = extractInlineCitationBlock(promptV2);
      expect(v2Block).toBe(v1Block);
    });

    it('specialist prompt ' + i + ': v2 NÃO contém "Buscar:" nem "PROTOCOLO DE BUSCA"', () => {
      expect(promptV2).not.toMatch(/Buscar:/);
      expect(promptV2).not.toMatch(/PROTOCOLO DE BUSCA/);
    });

    it('specialist prompt ' + i + ': v2 contém <evidence_pack> e placeholder', () => {
      expect(promptV2).toMatch(/<evidence_pack>/);
      expect(promptV2).toMatch(/{EVIDENCE_PACK_INJECTED_HERE}/);
    });
  });

  it('teia-identity: markers PORTA idênticos entre v1 e v2', () => {
    expect(extractMarkers(PROMPT_TEIA_IDENTITY_MODULE_V2)).toEqual(extractMarkers(PROMPT_TEIA_IDENTITY_MODULE));
  });

  it('teia-identity v2: NÃO contém "Buscar:" mas contém <evidence_pack>', () => {
    expect(PROMPT_TEIA_IDENTITY_MODULE_V2).not.toMatch(/Buscar:/);
    expect(PROMPT_TEIA_IDENTITY_MODULE_V2).toMatch(/<evidence_pack>/);
  });

  it('teia-identity v2: contém placeholder de evidence pack', () => {
    expect(PROMPT_TEIA_IDENTITY_MODULE_V2).toMatch(/{EVIDENCE_PACK_INJECTED_HERE}/);
  });
});
