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
  | 'RELATIONSHIP_INVERTED'
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
  /\b(capacidade\s+(est[áa]tica|de|produtiva)|roi|retorno\s+sobre|prazo\s+de\s+\d+|integra[cç][aã]o\s+nativa|middleware)\b/i;

/** Frase que nega conhecimento (não é afirmação de fato) — não dispara hard fail. */
const KNOWLEDGE_NEGATION =
  /\b(n[aã]o\s+(est[áa]|foi|é)\s+(dispon[ií]vel|identificad[oa]s?|poss[ií]vel|confirmad[oa]s?)|deve\s+ser\s+confirmad[oa]s?|sem\s+evid[êe]ncia)\b/i;

/** Fonte não aceitável como prova externa (estimativa/inferência/recorte interno). */
const NON_EXTERNAL_SOURCE =
  /\b(estimativa|infer[êe]ncia|an[áa]lise de m[óo]dulos|dossi[êe] legado|crm interno)\b/i;

/** Valor numérico com unidade numa frase ("120 mil sacas", "500 toneladas"). */
const VALUE_PATTERN =
  /\b(\d+(?:[.,]\d+)?\s*(?:mil|milh[oõ]es|toneladas?|sacas?|unidades?|lojas?|funcion[áa]rios?|entregas?|torres?|dias?|meses?|%|m[²3]?|t)\w*)\b/i;

function extractValue(text: string): string | null {
  const m = text.match(VALUE_PATTERN);
  return m ? normalizeName(m[1]) : null;
}

function valuesMatch(a: string, b: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[\s.,]/g, '');
  return norm(a) === norm(b);
}

/**
 * Reconciliação por PROVENIÊNCIA REAL em nível de CLAIM: a afirmação do Gold
 * só deixa de ser UNSUPPORTED_PRODUCT_CLAIM quando existe um fato no
 * SafeFindingPack com status Confirmado, fonte aceitável, MESMA CATEGORIA,
 * MESMA ENTIDADE e VALOR COMPATÍVEL. A evidência não pode ser "emprestada":
 * um fato "120 mil sacas" da entidade B não legitima "900 mil sacas" da conta A.
 */
function isSupportedBySafePack(
  sentenceLower: string,
  sentence: string,
  safePack: SafeFindingPack,
  canonical: CanonicalAccount,
): boolean {
  const terms: Array<{ pattern: RegExp; match: (c: string) => boolean }> = [
    { pattern: /capacidade/, match: (c) => /capacidade/.test(c) },
    { pattern: /produ[cç][aã]o\s+de/, match: (c) => /produ[cç][aã]o\s+de/.test(c) },
    { pattern: /roi|retorno\s+sobre/, match: (c) => /roi|retorno\s+sobre/.test(c) },
    { pattern: /prazo\s+de\s+\d+/, match: (c) => /prazo\s+de\s+\d+/.test(c) },
    { pattern: /integra[cç][aã]o\s+nativa/, match: (c) => /integra[cç][aã]o/.test(c) },
    { pattern: /middleware/, match: (c) => /middleware/.test(c) },
  ];
  const hit = terms.find((t) => t.pattern.test(sentenceLower));
  if (!hit) return false;

  const goldValue = extractValue(sentence);
  // Entidade referida na frase: menção explícita de entidade conhecida;
  // caso contrário, a referência é a CONTA CANÔNICA.
  const accountName = normalizeName(canonical.legalName);
  const mentionedEntity = [...safePack.relationships]
    .map((r) => normalizeName(r.relatedEntity))
    .find((name) => sentenceLower.includes(name));
  const referredEntity = mentionedEntity ?? accountName;

  return safePack.facts.some((f) => {
    if (f.status !== 'Confirmado') return false;
    if (NON_EXTERNAL_SOURCE.test(f.source)) return false;
    if (!hit.match(f.claim.toLowerCase())) return false;
    // Mesma entidade: o fato precisa pertencer à entidade referida na frase.
    if (normalizeName(f.entity) !== referredEntity) return false;
    // Valor compatível: Gold sem valor é sustentado por fato com valor;
    // Gold com valor exige fato com o MESMO valor.
    const factValue = extractValue(f.claim);
    if (goldValue) {
      if (!factValue) return false;
      if (!valuesMatch(goldValue, factValue)) return false;
    }
    return true;
  });
}

/** Verbos de participação societária (para detectar inversão de relação direta). */
const PARTICIPATION_VERB =
  /\b(participa\s+do\s+capital|é\s+s[óo]cia|s[óo]cia\s+de|controla|é\s+controladora|det[ée]m\s+participa[cç][aã]o)\b/i;

function normalizeName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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

    // 6) Capacidade/produto/prazo/ROI/integração afirmados sem validação.
    //    A exceção NUNCA vem do texto do Gold (o modelo poderia inventar
    //    "confirmada em laudo" na saída): ela só existe quando a afirmação é
    //    RECONCILIADA com um fato do SafeFindingPack com status Confirmado
    //    e fonte aceitável (proveniência real, não linguagem).
    if (
      UNSUPPORTED_CLAIM.test(sentenceLower) &&
      !KNOWLEDGE_NEGATION.test(sentenceLower) &&
      !isSupportedBySafePack(sentenceLower, sentence, safePack, canonical)
    ) {
      push('UNSUPPORTED_PRODUCT_CLAIM', `Frase afirma capacidade/produto/prazo/ROI sem fonte: "${sentence}"`);
    }

    // 7) Relação societária direta invertida: a CONTA não pode ser quem
    //    participa do capital da PJ direta — o canonical define a direção
    //    (PJ direta/holding participa da conta, não o contrário).
    const verbMatch = sentenceLower.match(PARTICIPATION_VERB);
    if (verbMatch) {
      const verbIndex = verbMatch.index ?? -1;
      const accountIndex = sentenceLower.indexOf(normalizeName(canonical.legalName));
      for (const partner of canonical.directPjPartners) {
        const partnerIndex = sentenceLower.indexOf(normalizeName(partner.legalName));
        if (accountIndex >= 0 && partnerIndex >= 0 && accountIndex < verbIndex && partnerIndex > verbIndex) {
          push(
            'RELATIONSHIP_INVERTED',
            `Frase inverte a relação direta: a conta participa do capital de ${partner.legalName} sem evidência`,
          );
        }
      }
    }
  }

  return { passed: hardFails.length === 0, hardFails };
}
