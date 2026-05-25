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
    if (
      hasPipe &&
      (normalized.includes('cnpj') || normalized.includes('razao social'))
    ) {
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

function parseRelatedCompanyToken(rawValue: string): { name: string; cnpj: string | null } | null {
  const value = rawValue.trim().replace(/\.$/, '');
  if (!value) return null;
  const cnpjMatch = value.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  const cnpj = normalizeCnpj(cnpjMatch?.[0] || '');
  const name = value
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return null;
  if (cnpjMatch && !isValidCnpj(cnpj)) return null;
  return { name, cnpj: isValidCnpj(cnpj) ? cnpj : null };
}

function extractFirstCnpj(value: string): string {
  const cnpjMatch = value.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  const cnpj = normalizeCnpj(cnpjMatch?.[0] || value);
  return isValidCnpj(cnpj) ? cnpj : '';
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
      c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    );

    const cnpjCol = normalizedHeaders.findIndex(c => /^cnpj\b/.test(c));
    const nameCol = normalizedHeaders.findIndex(c => /razao\s+socia/.test(c));
    const socioCol = normalizedHeaders.findIndex(c => /^socio$|^socio\s+admin|^socio\s+administrador/.test(c));
    const isOtherCnpjsTable = normalizeText(sectionHeadingBefore(lines, table.headerIdx)).includes('outros cnpjs');

    for (let i = table.headerIdx + 2; i < table.tableEndIdx; i++) {
      const row = lines[i].trim();
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      const rawCnpj = cnpjCol >= 0 && cnpjCol < cells.length ? cells[cnpjCol] : '';
      const name = nameCol >= 0 && nameCol < cells.length ? cells[nameCol] : '';
      if (!name || name === '-') continue;

      const normalizedCnpj = extractFirstCnpj(rawCnpj);
      const cnpjNote = rawCnpj.trim().toUpperCase();

      if (rawCnpj && cnpjNote !== 'CNPJ NAO CONFIRMADO' && !cnpjNote.startsWith('-') && normalizedCnpj.length !== 14) {
        warnings.push(`CNPJ invalido ignorado para "${name}": ${rawCnpj}`);
        continue;
      }

      const relacaoCol = normalizedHeaders.findIndex(c => /relac(ao|ão)/.test(c));
      const fonteCol = normalizedHeaders.findIndex(c => c === 'fonte');
      const confiancaCol = normalizedHeaders.findIndex(c => /confianc(a|ça)/.test(c));

      const rawConfidence = confiancaCol >= 0 ? cells[confiancaCol] ?? '' : '';
      const partnerName = socioCol >= 0 && socioCol < cells.length ? cells[socioCol]?.trim() || '' : '';
      const relationshipScope = isOtherCnpjsTable || partnerName ? 'partner_other_cnpj' : 'group_link';

      companies.push({
        name: name.trim(),
        cnpj: isValidCnpj(normalizedCnpj) ? normalizedCnpj : null,
        partnerName,
        role: relacaoCol >= 0 ? cells[relacaoCol]?.trim() || undefined : undefined,
        sourceTitle: fonteCol >= 0 ? cells[fonteCol]?.trim() || undefined : undefined,
        confidence: mapConfidence(rawConfidence),
        evidenceType: mapEvidenceType(rawConfidence),
        relationshipScope,
        rootContext: relationshipScope === 'group_link',
      });
    }
    }
  }

  const socioBlocks = markdown.split(/\*\*S[oó]cio\s+\d+:\*\*/i);
  const qsaBlocks = socioBlocks.slice(1);

  for (const block of qsaBlocks) {
    const partnerNameMatch = block.match(/^([^\n]+)/);
    const extractedPartnerName = partnerNameMatch?.[1]?.trim() || '';

    const empresasMatch = block.match(
      /\*\*(?:Empresas Relacionadas|Empresas do Grupo Economico|Empresas do Grupo Econômico):\*\*\s*([^\n]+)/i,
    );
    if (empresasMatch) {
      const names = empresasMatch[1]
        .split(',')
        .map((n) => n.trim().replace(/\.$/, ''))
        .filter(Boolean);
      for (const qsaName of names) {
        if (!qsaName) continue;
        const normalized = normalizeText(qsaName);
        const existing = companies.find(c =>
          normalizeText(c.name) === normalized ||
          normalizeText(c.name).includes(normalized) ||
          normalized.includes(normalizeText(c.name)),
        );
        if (existing) {
          if (extractedPartnerName && !existing.partnerName) {
            existing.partnerName = extractedPartnerName;
          }
          continue;
        }
        companies.push({
          name: qsaName.trim(),
          cnpj: null,
          partnerName: extractedPartnerName,
          sourceTitle: 'Gemini — QSA inference',
          confidence: 'weak',
          evidenceType: 'web',
          relationshipScope: 'group_link',
          rootContext: true,
        });
      }
    }

    const outrosCnpjsMatch = block.match(
      /\*\*Outros CNPJs:\*\*\s*([^\n]+)/i,
    );
    if (outrosCnpjsMatch) {
      const tokens = outrosCnpjsMatch[1]
        .split(',')
        .map(parseRelatedCompanyToken)
        .filter((token): token is { name: string; cnpj: string | null } => Boolean(token));

      for (const token of tokens) {
        companies.push({
          name: token.name,
          cnpj: token.cnpj,
          partnerName: extractedPartnerName,
          sourceTitle: 'Gemini — Outros CNPJs do sócio',
          confidence: token.cnpj ? 'medium' : 'weak',
          evidenceType: token.cnpj ? 'registry' : 'web',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        });
      }
    }
  }

  return { companies, warnings };
}
