import { describe, expect, it } from 'vitest';

import { extractCompetitorFromMessage } from '../../services/war-room/intent';

describe('extractCompetitorFromMessage', () => {
  it('does not misread TOTVS as "vs"', () => {
    const out = extractCompetitorFromMessage('compare a totvs com a senior para o contas a pagar');
    expect(out.toLowerCase()).toBe('totvs');
  });

  it('supports senior vs competitor pattern', () => {
    expect(extractCompetitorFromMessage('Senior vs SAP no financeiro')).toBe('SAP no financeiro');
  });
});
