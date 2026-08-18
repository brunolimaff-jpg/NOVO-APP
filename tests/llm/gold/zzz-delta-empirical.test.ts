import { describe, expect, it } from 'vitest';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import { buildGoldArtifact } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { matchesSensitiveTheme, matchesUnsupportedOperationalClaim } from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

const BAD_GOLD = `# Gold Brief

### 1. SÍNTESE EXECUTIVA 🎯

### 2. PERFIL 🏭
Operação verticalizada.

### 3. ESTRUTURA SOCIETÁRIA 🏛️

### 4. TECNOLOGIA 💻

### 5. PESSOAS-CHAVE 👥

### 6. INDICADORES 📊

### 7. SINAIS 🚨

### 8. RISCOS ⚠️

### 9. PRÓXIMOS PASSOS 🧭
`;

function pack(overrides: Partial<SafeFindingPack> = {}): SafeFindingPack {
  return {
    module: 'gold-compactor',
    accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
    facts: [],
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
    ...overrides,
  } as SafeFindingPack;
}

describe('empirical', () => {
  it('DELTA A: badge Confirmado (fato) vs A validar', () => {
    const p = pack({
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação internacional da holding em Cumaribo.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
      ],
    });
    const artifact = buildGoldArtifact(BAD_GOLD, canonical, p);
    const result = verifyGold(artifact.markdown, canonical, p);
    console.log('DELTA A artifact markdown:\n', artifact.markdown);
    console.log('DELTA A hardFails:', result.hardFails.map((h) => h.code));
    expect(true).toBe(true);
  });

  it('DELTA B: technologySignal observedFact protegido', () => {
    const p = pack({
      facts: [],
      technologySignals: [
        { technology: 'WMS', observedFact: 'Capacidade estática de armazenagem de 1,2 milhão de sacas.', status: 'Confirmado', whatIsNotKnown: 'Qual solução suporta a armazenagem.', validationQuestion: 'Qual solução suporta hoje a armazenagem?' },
      ],
      openQuestions: [],
    });
    const artifact = buildGoldArtifact(BAD_GOLD, canonical, p);
    const result = verifyGold(artifact.markdown, canonical, p);
    console.log('DELTA B artifact markdown:\n', artifact.markdown);
    console.log('DELTA B hardFails:', result.hardFails.map((h) => h.code));
    expect(true).toBe(true);
  });

  it('DELTA C: governance same entity same category', () => {
    const p = pack({
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'A empresa é uma holding controladora confirmada em registro oficial externo.', status: 'Confirmado', source: 'Registro oficial', kind: 'relationship', process: null },
      ],
    });
    const artifact = buildGoldArtifact(BAD_GOLD, canonical, p);
    const result = verifyGold(artifact.markdown, canonical, p);
    console.log('DELTA C artifact markdown:\n', artifact.markdown);
    console.log('DELTA C hardFails:', result.hardFails.map((h) => h.code));
    expect(true).toBe(true);
  });

  it('matchers', () => {
    console.log('sensitive "Operação internacional da holding em Cumaribo.":', matchesSensitiveTheme('Operação internacional da holding em Cumaribo.'));
    console.log('unsupported "Capacidade estática de armazenagem de 1,2 milhão de sacas.":', matchesUnsupportedOperationalClaim('Capacidade estática de armazenagem de 1,2 milhão de sacas.'));
    console.log('unsupported "Sinal de tecnologia confirmado":', matchesUnsupportedOperationalClaim('Sinal de tecnologia confirmado'));
    expect(true).toBe(true);
  });
});