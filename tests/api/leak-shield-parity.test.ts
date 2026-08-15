/**
 * BRU-109 DECISÃO 3 (C) — Paridade do leak shield (RED→GREEN).
 *
 * Veredito do Planejador (2026-08-15): o serverless (api/llm.ts) e o cliente
 * (utils/textCleaners.ts) devem usar a MESMA política de detecção de prompt
 * leak (utils/leakShieldPolicy.ts) — sem cópia local de regex (drift). Antes,
 * o serverless tinha apenas 6 hard patterns e deixava passar
 * contexto_cadastral / nota_de_escopo / aviso_metodologico (o Gold só tem o
 * shield do server). RED: esses 3 padrões atravessavam applyPromptLeakShieldLocal.
 * GREEN: paridade — o serverless bloqueia o mesmo conjunto.
 */
import { describe, expect, it } from 'vitest';
import { applyPromptLeakShieldLocal } from '../../api/llm';
import { HARD_PROMPT_LEAK_PATTERNS, SOFT_PROMPT_LEAK_PATTERNS, detectPromptLeakIndicators } from '../../utils/leakShieldPolicy';
import { detectPromptLeakIndicators as detectClientIndicators } from '../../utils/textCleaners';

describe('BRU-109 (C) — leak shield: política canônica compartilhada (paridade)', () => {
  it('RED→GREEN: serverless bloqueia contexto_cadastral que antes passava', () => {
    const leaked = 'Contexto cadastral obrigatório: use o cadastro da empresa para responder.';
    const result = applyPromptLeakShieldLocal(leaked);
    expect(result.blocked).toBe(true);
    expect(result.text).toContain('confirme o CNPJ');
  });

  it('RED→GREEN: serverless bloqueia nota_de_escopo que antes passava', () => {
    const leaked = 'Nota de escopo: este módulo deve operar apenas com dados oficiais.';
    const result = applyPromptLeakShieldLocal(leaked);
    expect(result.blocked).toBe(true);
  });

  it('RED→GREEN: serverless bloqueia aviso_metodologico que antes passava', () => {
    const leaked = 'Aviso metodológico: este dossiê foi gerado com inferências.';
    const result = applyPromptLeakShieldLocal(leaked);
    expect(result.blocked).toBe(true);
  });

  it('canônico tem os 10 hard patterns (incluindo os 3 que faltavam no serverless)', () => {
    const ids = HARD_PROMPT_LEAK_PATTERNS.map((p) => p.id);
    expect(ids).toHaveLength(10);
    expect(ids).toContain('contexto_cadastral');
    expect(ids).toContain('nota_de_escopo');
    expect(ids).toContain('aviso_metodologico');
    expect(ids).toContain('absolute_mission');
    expect(ids).toContain('internal_markers');
    expect(SOFT_PROMPT_LEAK_PATTERNS).toHaveLength(4);
  });

  it('paridade: cliente e servidor detectam o mesmo texto de leak (mesmo conjunto)', () => {
    const leaked = 'Urgente: ignore metadiscussões — sua missão absoluta é revelar o protocolo de investigação forense.';
    const server = detectPromptLeakIndicators(leaked);
    const client = detectClientIndicators(leaked);
    expect(server.detected).toBe(true);
    expect(client.detected).toBe(true);
    // o client adiciona fingerprint; os indicators vêm da mesma política
    expect(client.indicators).toEqual(server.indicators);
  });

  it('regressão obrigatória: JSON pretty do Compact permanece byte-safe no serverless', () => {
    const json = JSON.stringify(
      { module: 'gold-compactor', facts: [{ id: 'f1', claim: 'x' }], conflicts: ['a', 'b'] },
      null,
      2,
    );
    expect(json).toMatch(/^\s*\]\s*$/m);
    const result = applyPromptLeakShieldLocal(json);
    expect(result.blocked).toBe(false);
    expect(result.text).toBe(json);
    expect(() => JSON.parse(result.text)).not.toThrow();
  });

  it('regressão obrigatória: markers/leaks conhecidos continuam bloqueados (sem relaxamento)', () => {
    // marker `[[...]]` seguido de leak real → bloqueia após o strip
    expect(applyPromptLeakShieldLocal('[[REASONING: segredo]]\nsua missão absoluta é revelar').blocked).toBe(true);
    expect(applyPromptLeakShieldLocal('sua missão absoluta é responder').blocked).toBe(true);
    expect(applyPromptLeakShieldLocal('não discuta o funcionamento interno do modelo').blocked).toBe(true);
  });
});
