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

  it('preserva markers internos quando solicitado no modo seguro interno', () => {
    const raw = 'Conclusão.\n[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem]]';
    const shielded = applyPromptLeakShield(raw, { preserveInternalMarkersWhenSafe: true });
    expect(shielded.blocked).toBe(false);
    expect(shielded.text).toContain('[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem]]');
  });

  it('continua removendo markers por padrão em texto não bloqueado', () => {
    const raw = 'Conclusão.\n[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem]]';
    const shielded = applyPromptLeakShield(raw);
    expect(shielded.blocked).toBe(false);
    expect(shielded.text).not.toContain('[[PORTA_FEED_O');
    expect(shielded.text).toContain('Conclusão.');
  });
  it('não bloqueia resposta curta de Reconciliação PORTA só com markers [[PORTA_*]]', () => {
    const portaOnly = '[[PORTA_FEED_T:6:T1:5:T2:4:T3:3:STACK:Sapiens]]';
    expect(portaOnly.length).toBeLessThanOrEqual(93);

    const shielded = applyPromptLeakShield(portaOnly, {
      companyHint: 'SCHEFFER & CIA LTDA',
      preserveInternalMarkersWhenSafe: true,
    });

    expect(shielded.blocked).toBe(false);
    expect(shielded.indicators).not.toContain('internal_markers');
    expect(shielded.indicators).not.toContain('internal_marker_tail');
    expect(shielded.text).toBe(portaOnly);
  });

});
