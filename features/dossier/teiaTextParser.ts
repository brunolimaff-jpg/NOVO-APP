import { normalizeCnpj } from '../../utils/cnpj';
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
  const upper = confidenceStr.toUpperCase();
  if (upper.includes('OFICIAL')) return 'strong';
  if (upper.includes('PUBLICA')) return 'medium';
  if (upper.includes('INFERIDA') || upper.includes('NAO CONFIRMADA')) return 'weak';
  return 'weak';
}

function mapEvidenceType(confidenceStr: string): SocietaryCompanyInput['evidenceType'] {
  const upper = confidenceStr.toUpperCase();
  if (upper.includes('OFICIAL')) return 'qsa';
  return 'web';
}

function findCnpjTable(lines: string[]): { headerIdx: number; tableEndIdx: number } | null {
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
      return { headerIdx: i, tableEndIdx: endIdx };
    }
  }
  return null;
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
  return { name, cnpj: cnpj.length === 14 ? cnpj : null };
}

export function parseTeiaText(markdown: string): ParsedTeiaData {
  const warnings: string[] = [];
  const companies: SocietaryCompanyInput[] = [];
  const lines = markdown.split('\n');

  const table = findCnpjTable(lines);
  if (!table) {
    warnings.push('Tabela de CNPJs nao encontrada no texto.');
  } else {

    const headerCells = lines[table.headerIdx]
      .split('|')
      .map(c => c.trim())
      .filter(Boolean);

    const normalizedHeaders = headerCells.map(c =>
      c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    );

    const cnpjCol = normalizedHeaders.findIndex(c => c === 'cnpj');
    const nameCol = normalizedHeaders.findIndex(c => /razao\s+socia/.test(c));

    for (let i = table.headerIdx + 2; i < table.tableEndIdx; i++) {
      const row = lines[i].trim();
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      const rawCnpj = cnpjCol >= 0 && cnpjCol < cells.length ? cells[cnpjCol] : '';
      const name = nameCol >= 0 && nameCol < cells.length ? cells[nameCol] : '';
      if (!name || name === '-') continue;

      const normalizedCnpj = normalizeCnpj(rawCnpj);
      const cnpjNote = rawCnpj.trim().toUpperCase();

      if (rawCnpj && cnpjNote !== 'CNPJ NAO CONFIRMADO' && !cnpjNote.startsWith('-') && normalizedCnpj.length !== 14) {
        warnings.push(`CNPJ invalido ignorado para "${name}": ${rawCnpj}`);
        continue;
      }

      const relacaoCol = normalizedHeaders.findIndex(c => /relac(ao|ão)/.test(c));
      const fonteCol = normalizedHeaders.findIndex(c => c === 'fonte');
      const confiancaCol = normalizedHeaders.findIndex(c => /confianc(a|ça)/.test(c));

      const rawConfidence = confiancaCol >= 0 ? cells[confiancaCol] ?? '' : '';

      companies.push({
        name: name.trim(),
        cnpj: normalizedCnpj.length === 14 ? normalizedCnpj : null,
        partnerName: '',
        role: relacaoCol >= 0 ? cells[relacaoCol]?.trim() || undefined : undefined,
        sourceTitle: fonteCol >= 0 ? cells[fonteCol]?.trim() || undefined : undefined,
        confidence: mapConfidence(rawConfidence),
        evidenceType: mapEvidenceType(rawConfidence),
        relationshipScope: 'group_link',
        rootContext: true,
      });
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
