import { describe, expect, it } from 'vitest';
import { sanitizeLoadingContextText, stripInternalMarkers } from '../../utils/textCleaners';

describe('textCleaners security hardening', () => {
  it('remove marcadores internos e metadados de protocolo', () => {
    const raw = [
      'Resumo útil para o vendedor.',
      '[[STATUS: Consultando inteligência interna...]]',
      '[[PORTA_FEED_A:8:A1:7:A2:9:GERACAO:G2]]',
      'Protocolo de investigação forense especializada',
    ].join('\n');

    const cleaned = stripInternalMarkers(raw);
    expect(cleaned).toContain('Resumo útil para o vendedor.');
    expect(cleaned).not.toContain('[[STATUS:');
    expect(cleaned).not.toContain('[[PORTA_FEED_A:');
    expect(cleaned).not.toContain('Protocolo de investigação forense');
  });

  it('sanitiza query de loading suspeita usando fallback da empresa', () => {
    const leakedPrompt =
      'Deep Dive de [BOM FUTURO]. Protocolo de investigação forense especializada: INVESTIGACAO_COMPLETA_INTEGRADA';
    const sanitized = sanitizeLoadingContextText(leakedPrompt, 'BOM FUTURO');
    expect(sanitized).toBe('Investigação da empresa BOM FUTURO');
  });
});
