import type { EvidencePack } from '../llm/query-planner';

/**
 * Formata EvidencePack como texto injetável no prompt v2.
 * Substitui o placeholder {EVIDENCE_PACK_INJECTED_HERE}.
 */
export function formatEvidencePackForPrompt(pack: EvidencePack): string {
  if (!pack.items.length) {
    return [
      '',
      '[EVIDENCE PACK — VAZIO]',
      'Nenhuma evidência foi coletada pelo pipeline de busca nesta sessão.',
      'Declare "LACUNA: sem evidência coletada" nos campos não cobertos.',
      'NÃO invente URLs. NÃO finja que pesquisou.',
      '',
    ].join('\n');
  }

  const usableItems = pack.items.filter(i => i.usableForReport);

  const lines: string[] = [
    '',
    '[EVIDENCE PACK — use APENAS as URLs abaixo em [[n]](url)]',
    'Coletadas: ' +
      pack.items.length +
      ' evidências (' +
      usableItems.length +
      ' utilizáveis, ' +
      (pack.items.length - usableItems.length) +
      ' rejeitadas).',
    'Cobertura: ' + pack.confidenceProfile.modulesCovered.length + ' módulos cobertos.',
    'Tiers: A=' +
      pack.confidenceProfile.tierACount +
      ' B=' +
      pack.confidenceProfile.tierBCount +
      ' C=' +
      pack.confidenceProfile.tierCCount +
      ' D=' +
      pack.confidenceProfile.tierDCount +
      ' (D rejeitadas por padrão).',
    '',
    '--- EVIDÊNCIAS UTILIZÁVEIS ---',
  ];

  usableItems.forEach((item, i) => {
    lines.push(
      i + 1 + '. [Tier ' + item.evidenceTier + ' | match: ' + item.entityMatch + ' | módulo: ' + item.module + ']',
      '   URL: ' + item.sourceResult.url,
      '   Título: ' + item.sourceResult.title,
      '   Claim: ' + item.extractedClaim.slice(0, 300),
      '',
    );
  });

  const allModules = [
    'teia_identity',
    'teia_deep',
    'inteligencia_operacional',
    'compliance_risco_fiscal',
    'caminho_venda',
    'arquitetura_ti',
  ] as const;
  const missing = allModules.filter(m => !(pack.confidenceProfile.modulesCovered as string[]).includes(m));
  if (missing.length > 0) {
    lines.push('--- MÓDULOS SEM COBERTURA (declare LACUNA) ---');
    missing.forEach(m => lines.push('- ' + m));
    lines.push('');
  }

  return lines.join('\n');
}
