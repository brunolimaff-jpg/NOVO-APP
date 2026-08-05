import { describe, expect, it } from 'vitest';
import { buildCacheKey, CACHE_KEY_VERSION } from '../../services/socio-search/types';

// Contrato atual (main 5a984148): buildCacheKey(rootCnpj, rootCompanyName, socioName)
// — 3 argumentos, sem operatorId. Call sites de produção usam apenas 3 argumentos
// (api/socio-search.ts:33). O isolamento por operador deixou de fazer parte da
// chave quando o cache foi unificado por CNPJ/sócio (dados públicos); a
// expectativa histórica de '::operator a::' foi removida junto.
describe('buildCacheKey', () => {
  it('produz a mesma chave para a mesma entrada (estável)', () => {
    const a = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    const b = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    expect(a).toBe(b);
  });

  it('normaliza o CNPJ com máscara', () => {
    const comMascara = buildCacheKey('04.733.767/0001-80', 'Scheffer', 'Guilherme M Scheffer');
    const semMascara = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    expect(comMascara).toBe(semMascara);
    expect(comMascara).toContain('04733767000180');
  });

  it('prefixa a chave com a versão do cache', () => {
    const key = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    expect(key.startsWith(`${CACHE_KEY_VERSION}::`)).toBe(true);
  });

  it('usa o nome da empresa quando o CNPJ está ausente', () => {
    const key = buildCacheKey('', 'Scheffer Holding', 'Guilherme M Scheffer');
    expect(key).toContain('scheffer holding');
  });

  it('distingue sócios diferentes', () => {
    const socioA = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    const socioB = buildCacheKey('04733767000180', 'Scheffer', 'Outra Pessoa');
    expect(socioA).not.toBe(socioB);
  });
});
