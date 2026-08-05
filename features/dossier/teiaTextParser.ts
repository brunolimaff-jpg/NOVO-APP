import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj';
import type { SocietaryCompanyInput } from './societaryGraph';

export interface ParsedTeiaData {
  companies: SocietaryCompanyInput[];
  warnings: string[];
}

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapConfidence(confidenceStr: string): SocietaryCompanyInput['confidence'] {
  const normalized = normalizeText(confidenceStr);
  if (normalized.includes('oficial')) return 'strong';
  if (normalized.includes('publica')) return 'medium';
  if (normalized.includes('inferida') || normalized.includes('nao confirmada')) return 'weak';
  return 'weak';
}

function mapEvidenceType(confidenceStr: string): SocietaryCompanyInput['evidenceType'] {
  const normalized = normalizeText(confidenceStr);
  if (normalized.includes('oficial')) return 'qsa';
  return 'web';
}

function findCnpjTables(lines: string[]): Array<{ headerIdx: number; tableEndIdx: number }> {
  const tables: Array<{ headerIdx: number; tableEndIdx: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const hasPipe = trimmed.includes('|');
    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (hasPipe && (normalized.includes('cnpj') || normalized.includes('razao social'))) {
      let endIdx = i + 2;
      while (endIdx < lines.length && lines[endIdx].trim().includes('|')) {
        endIdx++;
      }
      tables.push({ headerIdx: i, tableEndIdx: endIdx });
      i = endIdx - 1;
    }
  }
  return tables;
}

function sectionHeadingBefore(lines: string[], idx: number): string {
  for (let i = idx; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (/^#{1,6}\s+/.test(trimmed)) return trimmed;
  }
  return '';
}

function parseCnpjLabel(rawValue: string): {
  cnpj: string | null;
  rawCnpjLabel?: string;
  validationStatus?: SocietaryCompanyInput['validationStatus'];
  hasCnpjText: boolean;
  isInvalidWithoutPendingMarker: boolean;
} {
  const cnpjMatch = rawValue.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(\*)?/);
  if (!cnpjMatch) {
    return {
      cnpj: null,
      hasCnpjText: false,
      isInvalidWithoutPendingMarker: false,
    };
  }

  const normalized = normalizeCnpj(cnpjMatch[1]);
  const hasPendingMarker = Boolean(cnpjMatch[2]) || rawValue.includes('*');
  const isValid = isValidCnpj(normalized);
  const rawCnpjLabel = `${cnpjMatch[1]}${hasPendingMarker ? '*' : ''}`;

  if (!isValid && !hasPendingMarker) {
    return {
      cnpj: null,
      hasCnpjText: true,
      isInvalidWithoutPendingMarker: true,
    };
  }

  return {
    cnpj: isValid ? normalized : null,
    rawCnpjLabel: hasPendingMarker ? rawCnpjLabel : undefined,
    validationStatus: hasPendingMarker ? 'pending' : undefined,
    hasCnpjText: true,
    isInvalidWithoutPendingMarker: false,
  };
}

function splitPartnerNames(rawValue: string): string[] {
  return rawValue
    .split(/\s*(?:,|;|\/|\be\b|\band\b)\s*/i)
    .map(name => name.trim().replace(/\*\*/g, '').trim())
    .filter(name => name.length > 0 && name !== '-');
}

function pushCompanyForPartners(
  companies: SocietaryCompanyInput[],
  company: SocietaryCompanyInput,
  partnerNames: string[],
): void {
  const names = partnerNames.length > 0 ? partnerNames : [company.partnerName || ''];
  for (const partnerName of names) {
    companies.push({
      ...company,
      partnerName,
    });
  }
}

function inferTableRelationshipScope(params: {
  validationStatus?: SocietaryCompanyInput['validationStatus'];
  isOtherCnpjsTable: boolean;
  partnerName: string;
  relation: string;
  scope: string;
  usage: string;
}): SocietaryCompanyInput['relationshipScope'] {
  if (params.validationStatus === 'pending') return 'unconfirmed';

  const semanticText = normalizeText([params.relation, params.scope, params.usage].filter(Boolean).join(' '));

  const groupConfirmed =
    /\bgrupo confirmado\b/.test(semanticText) ||
    /\bempresa do grupo\b/.test(semanticText) ||
    /\bgrupo economico\b/.test(semanticText) ||
    /\bmesmo cnpj raiz\b/.test(semanticText) ||
    /\bmatriz\b/.test(semanticText) ||
    /\bfilial\b/.test(semanticText) ||
    /\bcabeca do grupo\b/.test(semanticText);
  if (groupConfirmed) return 'group_link';

  const lateral =
    /\bcnpj lateral\b/.test(semanticText) ||
    /\bcnpj lateral socio\b/.test(semanticText) ||
    /\boutro cnpj\b/.test(semanticText) ||
    /\boutros cnpjs\b/.test(semanticText) ||
    /\bsocio aparece\b/.test(semanticText) ||
    /\bgrupo nao confirmado\b/.test(semanticText) ||
    /\bsem prova\b/.test(semanticText) ||
    /\bnao usar\b/.test(semanticText) ||
    /\bvalidar em reuniao\b/.test(semanticText);
  if (lateral) return 'partner_other_cnpj';

  if (params.isOtherCnpjsTable) return 'partner_other_cnpj';
  if (params.partnerName) return 'partner_other_cnpj';
  return 'group_link';
}

export function parseTeiaText(markdown: string): ParsedTeiaData {
  const warnings: string[] = [];
  const companies: SocietaryCompanyInput[] = [];
  const lines = markdown.split('\n');

  const tables = findCnpjTables(lines);
  if (tables.length === 0) {
    warnings.push('Tabela de CNPJs nao encontrada no texto.');
  } else {
    for (const table of tables) {
      const headerCells = lines[table.headerIdx]
        .split('|')
        .map(c => c.trim())
        .filter(Boolean);

      const normalizedHeaders = headerCells.map(c =>
        c
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      );

      const cnpjCol = normalizedHeaders.findIndex(c => /^cnpj\b/.test(c));
      const nameCol = normalizedHeaders.findIndex(c => /razao\s+socia/.test(c));
      const socioCol = normalizedHeaders.findIndex(
        c =>
          /^socio(s)?$/.test(c) ||
          /^socio(s)?\s+(admin|administrador|ligado|ligados|relacionado|relacionados)/.test(c) ||
          /socio(s)?\s+ligado/.test(c),
      );
      const isOtherCnpjsTable = normalizeText(sectionHeadingBefore(lines, table.headerIdx)).includes('outros cnpjs');
      if (isOtherCnpjsTable) {
        warnings.push('Tabela textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.');
        continue;
      }

      for (let i = table.headerIdx + 2; i < table.tableEndIdx; i++) {
        const row = lines[i].trim();
        const cells = row
          .split('|')
          .map(c => c.trim())
          .filter(Boolean);
        if (cells.length < 2) continue;

        const rawCnpj = cnpjCol >= 0 && cnpjCol < cells.length ? cells[cnpjCol] : '';
        const rawName = nameCol >= 0 && nameCol < cells.length ? cells[nameCol] : '';
        if (!rawName || rawName === '-') continue;

        const rawNameClean = rawName.replace(/\*\*/g, '').trim();
        const branchMatch = rawNameClean.match(/(\d+)\s*filiais?\b/i);
        const branchCount = branchMatch
          ? parseInt(branchMatch[1], 10) + 1 // +1 inclui a matriz
          : undefined;
        const name = rawNameClean.replace(/\s*\d+\s*filiais?\s*/i, '').trim();

        const parsedCnpj = parseCnpjLabel(rawCnpj);
        const cnpjNote = rawCnpj.trim().toUpperCase();

        if (
          rawCnpj &&
          cnpjNote !== 'CNPJ NAO CONFIRMADO' &&
          !cnpjNote.startsWith('-') &&
          parsedCnpj.isInvalidWithoutPendingMarker
        ) {
          warnings.push(`CNPJ invalido ignorado para "${name}": ${rawCnpj}`);
          continue;
        }

        const relacaoCol = normalizedHeaders.findIndex(c => /relac(ao|ão)/.test(c));
        const escopoCol = normalizedHeaders.findIndex(c => /^escopo\b/.test(c));
        const usoCol = normalizedHeaders.findIndex(c => /uso\s+comercial/.test(c) || /^uso$/.test(c));
        const fonteCol = normalizedHeaders.findIndex(c => c === 'fonte');
        const confiancaCol = normalizedHeaders.findIndex(c => /confianc(a|ça)/.test(c));

        const rawConfidence = confiancaCol >= 0 ? (cells[confiancaCol] ?? '') : '';
        const partnerNames = socioCol >= 0 && socioCol < cells.length ? splitPartnerNames(cells[socioCol] || '') : [];
        const partnerName = partnerNames[0] || '';
        const relation = relacaoCol >= 0 ? cells[relacaoCol]?.trim() || '' : '';
        const relationshipScope = inferTableRelationshipScope({
          validationStatus: parsedCnpj.validationStatus,
          isOtherCnpjsTable,
          partnerName,
          relation,
          scope: escopoCol >= 0 ? cells[escopoCol]?.trim() || '' : '',
          usage: usoCol >= 0 ? cells[usoCol]?.trim() || '' : '',
        });

        pushCompanyForPartners(
          companies,
          {
            name: name.trim(),
            cnpj: parsedCnpj.cnpj,
            rawCnpjLabel: parsedCnpj.rawCnpjLabel,
            partnerName,
            role: relation || undefined,
            branchCount,
            sourceTitle: fonteCol >= 0 && cells[fonteCol]?.trim() ? cells[fonteCol].trim() : 'LLM — Tabela CNPJs',
            confidence:
              parsedCnpj.validationStatus === 'pending'
                ? 'weak'
                : parsedCnpj.cnpj && mapConfidence(rawConfidence) === 'weak'
                  ? 'medium'
                  : mapConfidence(rawConfidence),
            evidenceType:
              parsedCnpj.cnpj && mapEvidenceType(rawConfidence) === 'web' ? 'registry' : mapEvidenceType(rawConfidence),
            relationshipScope,
            validationStatus: parsedCnpj.validationStatus,
            rootContext: relationshipScope === 'group_link',
          },
          partnerNames,
        );
      }
    }
  }

  const socioBlocks = markdown.split(/\*\*S[oó]cio\s+\d+:\*\*/i);
  const qsaBlocks = socioBlocks.slice(1);

  for (const block of qsaBlocks) {
    const partnerNameMatch = block.match(/^([^\n]+)/);
    const extractedPartnerName = partnerNameMatch?.[1]?.trim().replace(/\*\*/g, '').trim() || '';

    const empresasMatch = block.match(
      /\*\*(?:Empresas Relacionadas|Empresas do Grupo Economico|Empresas do Grupo Econômico):\*\*\s*([^\n]+)/i,
    );
    if (empresasMatch) {
      const names = empresasMatch[1]
        .split(',')
        .map(n => n.trim().replace(/\.$/, ''))
        .filter(Boolean);
      for (const qsaName of names) {
        if (!qsaName) continue;
        const normalized = normalizeText(qsaName);
        const existing = companies.find(
          c =>
            normalizeText(c.name) === normalized ||
            normalizeText(c.name).includes(normalized) ||
            normalized.includes(normalizeText(c.name)),
        );
        if (existing) {
          if (extractedPartnerName && !existing.partnerName) {
            existing.partnerName = extractedPartnerName;
          } else if (
            extractedPartnerName &&
            normalizeText(existing.partnerName || '') !== normalizeText(extractedPartnerName)
          ) {
            companies.push({
              ...existing,
              partnerName: extractedPartnerName,
            });
          }
          continue;
        }
        companies.push({
          name: qsaName.trim(),
          cnpj: null,
          partnerName: extractedPartnerName,
          sourceTitle: 'LLM — QSA inference',
          confidence: 'weak',
          evidenceType: 'web',
          relationshipScope: 'group_link',
          rootContext: true,
        });
      }
    }

    if (/\*\*Outros CNPJs:\*\*\s*([^\n]+)/i.test(block)) {
      warnings.push('Linha textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.');
    }
  }

  return { companies, warnings };
}

/** Total citado no resumo narrativo (Visão Geral), distinto da busca estruturada do SocietaryMap. */
export function parseNarrativeCnpjTotal(text: string): number | null {
  if (!text?.trim()) return null;

  const patterns = [
    /total de cnpjs identificados com fonte:[^0-9]*(\d+)/i,
    /total de cnpjs mapeados:[^0-9]*(\d+)/i,
    /numero de cnpjs ativos\s*\|\s*(\d+)/i,
  ];

  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}
