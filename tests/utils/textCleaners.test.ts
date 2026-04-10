import { describe, expect, it } from 'vitest';
import {
  applyPromptLeakShield,
  detectPromptLeakIndicators,
  sanitizeLoadingContextText,
  stripInternalMarkers,
} from '../../utils/textCleaners';

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
      'Dossiê completo de [BOM FUTURO]. Protocolo de investigação forense especializada: INVESTIGACAO_COMPLETA_INTEGRADA';
    const sanitized = sanitizeLoadingContextText(leakedPrompt, 'BOM FUTURO');
    expect(sanitized).toBe('Investigação da empresa BOM FUTURO');
  });

  it('detecta vazamento de prompt em linguagem natural e bloqueia com fallback seguro', () => {
    const leakedText =
      'URGENTE: Para gerar o dossiê de agronegócio e consolidar o Score PORTA, preciso do CNPJ da empresa em análise.';
    const detection = detectPromptLeakIndicators(leakedText);
    expect(detection.detected).toBe(true);
    expect(detection.fingerprint).toBeTruthy();

    const shielded = applyPromptLeakShield(leakedText, { companyHint: 'SCHEFFER & CIA LTDA' });
    expect(shielded.blocked).toBe(true);
    expect(shielded.text).toContain('CNPJ');
    expect(shielded.text).toContain('SCHEFFER & CIA LTDA');
    expect(shielded.text).not.toContain('URGENTE');
  });

  it('não bloqueia resposta legítima sem assinatura de prompt interno', () => {
    const legitimate =
      'Score PORTA parcial: 74. Próximos passos: validar CNPJ e aprofundar riscos fiscais com fontes auditáveis.';
    const shielded = applyPromptLeakShield(legitimate, { companyHint: 'Acme Agro' });
    expect(shielded.blocked).toBe(false);
    expect(shielded.text).toContain('Score PORTA parcial: 74');
  });
});
