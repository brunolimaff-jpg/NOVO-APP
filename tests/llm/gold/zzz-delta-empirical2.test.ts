import { describe, expect, it } from 'vitest';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import { buildGoldArtifact } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { matchesGovernanceRolePromotion } from '../../../services/llm/gold/gold-policy';
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

describe('empirical2', () => {
  it('show artifact + governance pattern', () => {
    const p = pack({
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'SCHEFFER & CIA LTDA é uma holding controladora conforme registro oficial externo.', status: 'Confirmado', source: 'Registro oficial', kind: 'relationship', process: null },
      ],
    });
    const artifact = buildGoldArtifact(BAD_GOLD, canonical, p);
    const result = verifyGold(artifact.markdown, canonical, p);
    process.stdout.write('ARTIFACT_START>>>' + artifact.markdown + '<<<ARTIFACT_END\n');
    process.stdout.write('HARDFAILS:' + JSON.stringify(result.hardFails) + '\n');
    process.stdout.write('GOVPATTERN:' + matchesGovernanceRolePromotion('SCHEFFER & CIA LTDA é uma holding controladora conforme registro oficial externo.') + '\n');
    expect(true).toBe(true);
  });
});
