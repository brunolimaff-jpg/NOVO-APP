/**
 * PACK_FORENSIC_REPLAY (Planejador 2026-08-10) — FULL FORENSIC FIXTURE.
 *
 * Usa o dump REAL do replay (frontier + Gold completo de 9 seções do caso
 * Scheffer) como fixture integrada: o Gold real do dump continha Colômbia
 * "confirmada", QSA→"núcleo familiar/decisão concentrada" e fragilidade
 * derivada — o verifier endurecido deve REPROVAR (hardFails > 0).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';

const fixturesDir = join(__dirname, 'fixtures');
const goldBrief = readFileSync(join(fixturesDir, 'scheffer-forensic-gold.md'), 'utf8');
const frontier = JSON.parse(readFileSync(join(fixturesDir, 'scheffer-forensic-frontier.json'), 'utf8')) as SafeFindingPack;

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: (frontier.people ?? []).map((p: { personName: string; role: string }) => ({ name: p.personName, role: p.role })),
};

describe('FULL FORENSIC FIXTURE — Gold real do dump (9 seções + frontier real)', () => {
  it('Gold do dump (Colômbia confirmada + núcleo familiar) → REJEITADO pelo verifier endurecido', () => {
    const result = verifyGold(goldBrief, canonical, frontier);
    expect(result.hardFails.length).toBeGreaterThan(0);
    const codes = result.hardFails.map((h) => h.code);
    expect(codes.some((c) => c === 'PROMOTED_CLAIM' || c === 'QSA_GOVERNANCE_CLAIM' || c === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
  });

  it('Gold corrigido (Colômbia a validar, QSA papel legal, sem fragilidade) → PASS', () => {
    const goldCorrigido = [
      '### 1. SÍNTESE EXECUTIVA 🎯',
      'O Grupo Scheffer opera no agronegócio com operação multiestado. Há indícios de presença na Colômbia (Cumaribo), ainda a validar.',
      '### 2. PERFIL 🏭',
      'Operação verticalizada de cultivo e beneficiamento, com ERP Senior de 74 módulos.',
      '### 3. ESTRUTURA SOCIETÁRIA 🏛️',
      'A SCHEFFER PARTICIPACOES S/A figura como sócia PJ da Scheffer & Cia Ltda. Cinco pessoas constam no QSA como Sócio-Administrador.',
      '### 4. TECNOLOGIA 💻',
      'WMS/TMS não constam do portfólio contratado.',
      '### 5. PESSOAS-CHAVE 👥',
      'ELIZEU ZULMAR MAGGI SCHEFFER consta no QSA como Sócio-Administrador.',
      '### 6. INDICADORES 📊',
      '74 módulos Senior contratados.',
      '### 7. SINAIS 🚨',
      'Sinal 1: verticalização com ERP único. Sinal 2: internacionalização a validar.',
      '### 8. RISCOS ⚠️',
      'A integração da operação internacional com o ERP é ponto a validar.',
      '### 9. PRÓXIMOS PASSOS 🧭',
      'A frente principal é validar a operação internacional. Adjacência 1: rastreabilidade. Adjacência 2: consolidação.',
      '1. Validar a operação na Colômbia com o cliente.',
      '2. Confirmar o escopo do ERP para a holding.',
      '3. Mapear requisitos de rastreabilidade para certificações.',
    ].join('\n');
    const result = verifyGold(goldCorrigido, canonical, frontier);
    expect(result.hardFails).toHaveLength(0);
  });
});
