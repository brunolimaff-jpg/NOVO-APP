import { describe, expect, it } from 'vitest';
import { buildEntityResolutionFromContext } from '../../services/llm/query-planner';

/**
 * SCOUT-V7-GOLD-EXPERIENCE-01D.1 (Planejador 2026-08-10) — segmento Gold
 * deve refletir o CNAE real. A entidade era construída com cnaePrincipal ''
 * no waterfall → Scheffer (SCHEFFER & CIA LTDA, CNAE 0115-6/00) caía em
 * industrial_geral em vez de agropecuaria. O waterfall agora reutiliza
 * fetchCompanyByCnpj (trilha Gold) e passa o cnaePrincipal real aqui.
 */

describe('buildEntityResolutionFromContext — segmento Gold por CNAE', () => {
  it('01D.1 RED/GREEN: Scheffer + CNAE 0115-6/00 → segmento agropecuaria', () => {
    const entity = buildEntityResolutionFromContext({
      cnpj: '04.733.767/0001-80',
      razaoSocial: 'SCHEFFER & CIA LTDA',
      cnaePrincipal: '0115-6/00',
      estadoOperacao: [],
    });
    expect(entity.segmentoInferido).toBe('agropecuaria');
    expect(entity.cnaePrincipal).toBe('0115-6/00');
  });

  it('01D.1: sem CNAE → segmento default industrial_geral (fail-soft, não derruba)', () => {
    const entity = buildEntityResolutionFromContext({
      cnpj: '04.733.767/0001-80',
      razaoSocial: 'SCHEFFER & CIA LTDA',
      cnaePrincipal: '',
      estadoOperacao: [],
    });
    expect(entity.segmentoInferido).toBe('industrial_geral');
  });

  it('01D.1: CNAE de construção (41/42/43) → construcao', () => {
    const entity = buildEntityResolutionFromContext({ cnpj: '12.345.678/0001-90', razaoSocial: 'CONSTRUTORA ALFA', cnaePrincipal: '4120-4/00', estadoOperacao: [] });
    expect(entity.segmentoInferido).toBe('construcao');
  });

  it('01D.1: CNAE de logística (49/50/52/53) → logistica', () => {
    const entity = buildEntityResolutionFromContext({ cnpj: '12.345.678/0001-90', razaoSocial: 'TRANSPORTES BETA', cnaePrincipal: '4930-2/01', estadoOperacao: [] });
    expect(entity.segmentoInferido).toBe('logistica');
  });

  it('01D.1: razão social agro também resolve agropecuaria mesmo sem CNAE (fallback de heurística existente)', () => {
    const entity = buildEntityResolutionFromContext({ cnpj: '12.345.678/0001-90', razaoSocial: 'FAZENDA BOA VISTA AGRO', cnaePrincipal: '', estadoOperacao: [] });
    expect(entity.segmentoInferido).toBe('agropecuaria');
  });
});
