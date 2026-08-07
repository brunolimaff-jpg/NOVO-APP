import { describe, expect, it } from 'vitest';
import type { CanonicalAccount } from '../../../services/llm/gold/gold-contracts';
import {
  resolveCanonicalRelations,
  type RelatedCompany,
} from '../../../services/llm/gold/canonical-relation-resolver';

/**
 * T2 — CanonicalRelationResolver (TDD).
 * Casos mínimos da definição final: precedência same_root > direct_pj_relation >
 * partner_other_cnpj, deduplicação e zero CPF.
 */

const schefferCanonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [{ name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' }],
};

describe('CanonicalRelationResolver', () => {
  it('classifica mesma raiz como same_root (matriz/filial da mesma PJ)', () => {
    const related: RelatedCompany[] = [
      { cnpj: '04.733.767/0014-03', legalName: 'SCHEFFER & CIA LTDA', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      relatedCnpj: '04733767001403',
      relationType: 'same_root',
    });
  });

  it('classifica PJ direta do QSA como direct_pj_relation', () => {
    const related: RelatedCompany[] = [
      { cnpj: '11.021.773/0001-70', legalName: 'SCHEFFER PARTICIPACOES S/A', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      relatedCnpj: '11021773000170',
      relationType: 'direct_pj_relation',
    });
  });

  it('classifica empresa encontrada apenas via sócio como lateral (partner_other_cnpj)', () => {
    const related: RelatedCompany[] = [
      { cnpj: '12.345.678/0001-90', legalName: 'EMPRESA LATERAL LTDA', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      relationType: 'partner_other_cnpj',
    });
  });

  it('deduplica PJ direta que reaparece via socio-search (preserva direta, elimina lateral)', () => {
    const related: RelatedCompany[] = [
      { cnpj: '11.021.773/0001-70', legalName: 'SCHEFFER PARTICIPACOES S/A', source: 'socio-search' },
      { cnpj: '11.021.773/0001-70', legalName: 'SCHEFFER PARTICIPACOES S/A', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    const direct = result.filter((r) => r.relationType === 'direct_pj_relation');
    const lateral = result.filter((r) => r.relationType === 'partner_other_cnpj');
    expect(direct).toHaveLength(1);
    expect(lateral).toHaveLength(0);
  });

  it('não promove lateral a grupo por compartilhamento de sócio', () => {
    const related: RelatedCompany[] = [
      { cnpj: '12.345.678/0001-90', legalName: 'EMPRESA LATERAL LTDA', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    expect(result[0].relationType).not.toBe('same_root');
    expect(result[0].relationType).not.toBe('direct_pj_relation');
  });

  it('nunca emite CPF e ignora entrada com CPF (11 dígitos)', () => {
    const related: RelatedCompany[] = [
      { cnpj: '123.456.789-00', legalName: 'PESSOA FISICA', source: 'socio-search' },
      { cnpj: '04.733.767/0014-03', legalName: 'SCHEFFER & CIA LTDA', source: 'socio-search' },
    ];
    const result = resolveCanonicalRelations(schefferCanonical, related);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('123456789');
    expect(result.some((r) => r.relatedCnpj.length !== 14)).toBe(false);
    expect(result).toHaveLength(1);
  });

  it('ignora CNPJ mal formatado sem lançar exceção', () => {
    const related: RelatedCompany[] = [
      { cnpj: 'INVALIDO', legalName: 'X', source: 'socio-search' },
      { cnpj: '04.733.767/0014-03', legalName: 'SCHEFFER & CIA LTDA', source: 'socio-search' },
    ];
    expect(() => resolveCanonicalRelations(schefferCanonical, related)).not.toThrow();
    const result = resolveCanonicalRelations(schefferCanonical, related);
    expect(result).toHaveLength(1);
  });
});
