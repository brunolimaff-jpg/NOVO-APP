/**
 * T4 — Entity/Semantic Gold Verifier (V4 Pipeline Guarded).
 *
 * Barreira final sobre o Gold Brief: extração estruturada de entidades
 * (CNPJ normalizado) — NUNCA regex de proximidade para pares entidade/atributo.
 * Responde apenas: "o Gold viola algum invariante que deveria ser impossível
 * depois do sanitizer?" — não reexecuta o sanitizer.
 */
import type { CanonicalAccount, SafeFindingPack } from './gold-contracts';
import { normalizeCnpj } from './canonical-relation-resolver';

export type GoldHardFailCode =
  | 'WRONG_ESTABLISHMENT_TYPE'
  | 'INVENTED_CNPJ'
  | 'LATERAL_PROMOTED'
  | 'NEGATIVE_EVIDENCE_AS_GAP'
  | 'NEGATIVE_EVIDENCE_AS_ABSENCE'
  | 'QSA_AS_DECISOR'
  | 'UNSUPPORTED_PRODUCT_CLAIM'
  | 'ENTITY_CONFLICT';

export interface GoldHardFail {
  code: GoldHardFailCode;
  reason: string;
}

export interface GoldVerificationResult {
  passed: boolean;
  hardFails: GoldHardFail[];
}

const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

const POSSESSION_NEGATION =
  /\bn[aã]o\s+(possui|possue|tem|utiliza|usa|adota|contratou)\b/i;

const GAP_CLAIM =
  /\b(gap|gaps|lacuna|lacunas)\s+(de|em|confirmado|identificado)\b/i;

const GROUP_PROMOTION_CLAIM = /\b(grupo econ[oô]mico|integra o grupo|controlada|controladora|consolidada)\b/i;

const EXECUTIVE_ROLE =
  /\b(cfo|ceo|coo|cio|cto|diretor|diretora|presidente|decisor|head\s+de|vice-presidente)\b/i;

const UNSUPPORTED_CLAIM =
  /\b(capacidade\s+(est[áa]tica|de|produtiva)|roi|retorno\s+sobre|prazo\s+de\s+\d|integra[cç][aã]o\s+nativa|middleware)\b/i;

function splitSentences(goldBrief: string): string[] {
  // Protege CNPJs formatados (contêm pontos) para o split de sentenças
  // não quebrar dentro deles.
  const placeholders: string[] = [];
  const protectedText = goldBrief.replace(CNPJ_PATTERN, (m) => {
    placeholders.push(m);
    return `__CNPJ${placeholders.length - 1}__`;
  });
  return protectedText
    .split(/[.;!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/__CNPJ(\d+)__/g, (_, i) => placeholders[Number(i)]));
}

export function verifyGold(
  goldBrief: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
): GoldVerificationResult {
  const hardFails: GoldHardFail[] = [];
  const push = (code: GoldHardFailCode, reason: string): void => {
    if (!hardFails.some((h) => h.code === code && h.reason === reason)) {
      hardFails.push({ code, reason });
    }
  };

  // === entidades conhecidas (canonical + pack) ===
  const expectedTypeByCnpj = new Map<string, 'Matriz' | 'Filial'>();
  const knownCnpjs = new Set<string>();
  const addKnown = (cnpj: string, type?: 'Matriz' | 'Filial'): void => {
    const digits = normalizeCnpj(cnpj);
    if (!digits) return;
    knownCnpjs.add(digits);
    if (type) expectedTypeByCnpj.set(digits, type);
  };
  addKnown(canonical.inputCnpj, canonical.establishmentType);
  if (canonical.headOfficeCnpj) {
    addKnown(canonical.headOfficeCnpj, canonical.establishmentType === 'Filial' ? 'Matriz' : 'Filial');
  }
  for (const partner of canonical.directPjPartners) addKnown(partner.cnpj);
  for (const rel of safePack.relationships) addKnown(rel.relatedEntity);

  const lateralNames = new Set(
    safePack.relationships
      .filter((r) => r.relationType === 'partner_other_cnpj')
      .map((r) => r.relatedEntity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );
  const qsaPeople = new Set(
    safePack.people
      .filter((p) => p.roleBasis === 'qsa')
      .map((p) => p.personName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );

  const sentences = splitSentences(goldBrief);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1) Entity-aware: tipo cadastral atribuído na frase vs canonical.
    const mentions = [...sentence.matchAll(CNPJ_PATTERN)];
    const hasMatrizWord = /\bmatriz\b/.test(sentenceLower);
    const hasFilialWord = /\bfilial\b/.test(sentenceLower);
    const attributedType =
      hasMatrizWord && !hasFilialWord ? 'Matriz' : hasFilialWord && !hasMatrizWord ? 'Filial' : undefined;

    for (const mention of mentions) {
      const digits = normalizeCnpj(mention[0]);
      if (!digits) continue;

      if (!knownCnpjs.has(digits)) {
        push('INVENTED_CNPJ', `CNPJ ${mention[0]} não pertence ao canonical nem às relações conhecidas`);
        continue;
      }
      if (attributedType) {
        const expected = expectedTypeByCnpj.get(digits);
        if (expected && attributedType !== expected) {
          push(
            'WRONG_ESTABLISHMENT_TYPE',
            `${mention[0]} classificado como ${attributedType}; canonical diz ${expected}`,
          );
        }
      }
    }

    // 2) Ausência → gap.
    if (GAP_CLAIM.test(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_GAP', `Frase afirma gap sem evidência positiva: "${sentence}"`);
    }

    // 3) Ausência → tecnologia inexistente (negação de posse).
    if (POSSESSION_NEGATION.test(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_ABSENCE', `Frase nega posse sem evidência positiva: "${sentence}"`);
    }

    // 4) Lateral promovida a grupo.
    if (GROUP_PROMOTION_CLAIM.test(sentence)) {
      const hasLateralName = [...lateralNames].some((name) => sentenceLower.includes(name));
      if (hasLateralName) {
        push('LATERAL_PROMOTED', `Frase promove relação lateral a grupo: "${sentence}"`);
      }
    }

    // 5) QSA → decisor funcional.
    if (EXECUTIVE_ROLE.test(sentenceLower)) {
      const mentionsQsaPerson = [...qsaPeople].some((name) => sentenceLower.includes(name));
      if (mentionsQsaPerson) {
        push('QSA_AS_DECISOR', `Frase atribui cargo funcional a pessoa do QSA: "${sentence}"`);
      }
    }

    // 6) Capacidade/produto/prazo/ROI/integração sem validação.
    if (UNSUPPORTED_CLAIM.test(sentenceLower)) {
      push('UNSUPPORTED_PRODUCT_CLAIM', `Frase afirma capacidade/produto/prazo/ROI sem fonte: "${sentence}"`);
    }
  }

  return { passed: hardFails.length === 0, hardFails };
}
