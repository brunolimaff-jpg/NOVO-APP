import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj';
import type {
  BuildSocietaryGraphInput,
  BuildSocietaryMermaidOptions,
  RejectedSocietaryCompany,
  SocietaryBadge,
  SocietaryCompany,
  SocietaryCompanyInput,
  SocietaryConfidence,
  SocietaryEvidenceType,
  SocietaryGraph,
  SocietaryPartner,
  SocietaryPartnerInput,
  SocietaryRelationshipScope,
  SocietaryRootInput,
} from './societaryGraph.types';

export type {
  SocietaryBadge,
  SocietaryCompany,
  SocietaryCompanyInput,
  SocietaryConfidence,
  SocietaryEvidenceType,
  SocietaryGraph,
  SocietaryPartner,
  SocietaryPartnerInput,
  SocietaryRelationshipScope,
  RejectedSocietaryCompany,
  SocietaryRootInput,
  BuildSocietaryGraphInput,
  BuildSocietaryMermaidOptions,
} from './societaryGraph.types';

export const SOCIETARY_LABEL_SOCIO_ADMIN = 'Sócio admin';

const DISPLAY_BADGE_ORDER: SocietaryBadge[] = ['holding', 'internacional', 'validar'];

export function countPartnerCompanies(graph: SocietaryGraph, partnerId: string): number {
  return graph.companies.filter(c => c.partnerIds.includes(partnerId)).length;
}

export { buildSocietaryMermaid, describeSocietaryCompanyType } from './buildSocietaryMermaid';

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toId(prefix: string, value: string): string {
  const slug = normalizeText(value).replace(/\s+/g, '_').slice(0, 42);
  return `${prefix}_${slug || 'item'}`;
}

export function formatSocietaryCnpj(value?: string | null): string {
  const cnpj = normalizeCnpj(value || '');
  if (cnpj.length !== 14) return value || '';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function buildCompanyKey(company: SocietaryCompanyInput): string {
  const cnpj = normalizeCnpj(company.cnpj || '');
  if (company.relationshipScope === 'unconfirmed' && company.rawCnpjLabel) {
    return `unconfirmed:${normalizeText(company.rawCnpjLabel)}:${normalizeText(company.name)}`;
  }
  if (isValidCnpj(cnpj)) {
    if (company.relationshipScope === 'unconfirmed') return `cnpj-pending:${cnpj}`;
    if (company.relationshipScope === 'partner_other_cnpj') return `cnpj:${cnpj}`;
    return `cnpj-root:${cnpj.slice(0, 8)}`;
  }
  return `name:${normalizeText(company.name)}:${(company.country || 'BR').trim().toUpperCase()}`;
}

function hasMeaningfulCompanyName(name: string): boolean {
  const legalOnly = new Set(['cia', 'companhia', 'ltda', 'sa', 's', 'a', 'sas', 's/a', 'me', 'eireli']);
  const meaningfulTokens = normalizeText(name)
    .split(/\s+/)
    .filter(token => token.length > 1 && !legalOnly.has(token));
  return meaningfulTokens.some(token => token.length >= 3);
}

function isRootEstablishment(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  const rootCnpj = normalizeCnpj(root.cnpj || '');
  const companyCnpj = normalizeCnpj(company.cnpj || '');
  if (isValidCnpj(rootCnpj) && isValidCnpj(companyCnpj)) {
    return companyCnpj.slice(0, 8) === rootCnpj.slice(0, 8);
  }

  const rootName = normalizeText(root.name);
  const companyName = normalizeText(company.name);
  return Boolean(rootName && companyName && companyName === rootName);
}

export function isHeadquartersCnpj(cnpj?: string): boolean {
  return Boolean(cnpj && cnpj.slice(8, 12) === '0001');
}

export function countCompanyFilials(company: Pick<SocietaryCompany, 'branchCount' | 'branchCnpjs'>): number {
  const listed = (company.branchCnpjs ?? []).filter(cnpj => isValidCnpj(normalizeCnpj(cnpj))).length;
  const establishments = Math.max(listed, company.branchCount ?? 1);
  if (establishments <= 1) return 0;
  return establishments - 1;
}

export function hasCompanyFilials(company: Pick<SocietaryCompany, 'branchCount' | 'branchCnpjs'>): boolean {
  return countCompanyFilials(company) > 0;
}

export function formatBranchBadgeLabel(
  company: Pick<SocietaryCompany, 'branchCount' | 'branchCnpjs' | 'cnpj'>,
): string | null {
  if (!hasCompanyFilials(company)) return null;
  const filiais = countCompanyFilials(company);
  if (isHeadquartersCnpj(company.cnpj)) {
    return `Matriz · ${filiais} ${filiais === 1 ? 'filial' : 'filiais'}`;
  }
  return `${filiais} ${filiais === 1 ? 'filial' : 'filiais'}`;
}

export function getDisplayBadges(company: SocietaryCompany): SocietaryBadge[] {
  return DISPLAY_BADGE_ORDER.filter(badge => company.badges.includes(badge));
}

function mergeBranchData(existing: SocietaryCompany, incoming: SocietaryCompanyInput): void {
  const normalizedCnpj = normalizeCnpj(incoming.cnpj || '');
  if (!isValidCnpj(normalizedCnpj)) return;

  const cnpjs = new Set(existing.branchCnpjs || (existing.cnpj ? [existing.cnpj] : []));
  cnpjs.add(normalizedCnpj);
  if (incoming.branchCnpjs?.length) {
    for (const branchCnpj of incoming.branchCnpjs) {
      const normalized = normalizeCnpj(branchCnpj);
      if (isValidCnpj(normalized)) cnpjs.add(normalized);
    }
  }
  existing.branchCnpjs = Array.from(cnpjs).sort((a, b) => {
    if (isHeadquartersCnpj(a)) return -1;
    if (isHeadquartersCnpj(b)) return 1;
    return a.localeCompare(b);
  });
  existing.branchCount = existing.branchCnpjs.length;

  if (!existing.cnpj || (!isHeadquartersCnpj(existing.cnpj) && isHeadquartersCnpj(normalizedCnpj))) {
    existing.id = toId('company', normalizedCnpj);
    existing.cnpj = normalizedCnpj;
    existing.name = incoming.name.trim() || existing.name;
    existing.role = incoming.role?.trim() || existing.role;
    existing.sourceTitle = incoming.sourceTitle?.trim() || existing.sourceTitle;
    existing.sourceUrl = incoming.sourceUrl?.trim() || existing.sourceUrl;
    existing.snippet = incoming.snippet?.trim() || existing.snippet;
  }
}

function confidenceRank(confidence?: SocietaryConfidence): number {
  switch (confidence) {
    case 'official':
      return 4;
    case 'strong':
      return 3;
    case 'medium':
      return 2;
    case 'weak':
    default:
      return 1;
  }
}

function evidenceTypeRank(evidenceType?: SocietaryEvidenceType): number {
  switch (evidenceType) {
    case 'qsa':
      return 5;
    case 'registry':
      return 4;
    case 'institutional':
      return 3;
    case 'trade':
      return 2;
    case 'web':
    default:
      return 1;
  }
}

function relationshipScopeRank(scope?: SocietaryRelationshipScope): number {
  switch (scope) {
    case 'group_link':
      return 3;
    case 'partner_other_cnpj':
      return 2;
    case 'unconfirmed':
    default:
      return 1;
  }
}

function companyEvidenceRank(
  company: Pick<SocietaryCompanyInput, 'confidence' | 'evidenceType' | 'relationshipScope' | 'rootContext'>,
): number {
  return (
    confidenceRank(company.confidence) * 1000 +
    evidenceTypeRank(company.evidenceType) * 100 +
    relationshipScopeRank(company.relationshipScope) * 10 +
    (company.rootContext ? 1 : 0)
  );
}

function shouldPromoteEvidence(existing: SocietaryCompany, incoming: SocietaryCompanyInput): boolean {
  return companyEvidenceRank(incoming) > companyEvidenceRank(existing);
}

function findCompanyByExactCnpj(cnpjIndex: Map<string, SocietaryCompany>, cnpj: string): SocietaryCompany | undefined {
  if (!isValidCnpj(cnpj)) return undefined;
  return cnpjIndex.get(cnpj);
}

function findCompanyByCnpjRadical(
  radicalIndex: Map<string, SocietaryCompany>,
  cnpj: string,
): SocietaryCompany | undefined {
  if (!isValidCnpj(cnpj)) return undefined;
  const radical = cnpj.slice(0, 8);
  return radicalIndex.get(radical);
}

function mergeCompanyRecords(target: SocietaryCompany, source: SocietaryCompany): void {
  for (const partnerId of source.partnerIds) {
    if (!target.partnerIds.includes(partnerId)) target.partnerIds.push(partnerId);
  }

  target.rootLinked = Boolean(target.rootLinked || source.rootLinked);

  if (companyEvidenceRank(source) > companyEvidenceRank(target)) {
    target.confidence = source.confidence;
    target.evidenceType = source.evidenceType;
    target.relationshipScope = source.relationshipScope;
    target.validationStatus = source.validationStatus || target.validationStatus;
    target.rootContext = source.rootContext;
    target.rootCompanyName = source.rootCompanyName || target.rootCompanyName;
    target.rootCnpj = source.rootCnpj || target.rootCnpj;
    target.sourceTitle = source.sourceTitle || target.sourceTitle;
    target.sourceUrl = source.sourceUrl || target.sourceUrl;
    target.snippet = source.snippet || target.snippet;
    target.role = source.role || target.role;
    target.rawCnpjLabel = source.rawCnpjLabel || target.rawCnpjLabel;
  }

  const cnpjs = new Set([...(target.branchCnpjs || []), ...(source.branchCnpjs || [])]);
  if (source.cnpj) cnpjs.add(source.cnpj);
  if (target.cnpj) cnpjs.add(target.cnpj);

  const branchCnpjs = Array.from(cnpjs)
    .filter(isValidCnpj)
    .sort((a, b) => {
      if (isHeadquartersCnpj(a)) return -1;
      if (isHeadquartersCnpj(b)) return 1;
      return a.localeCompare(b);
    });

  if (branchCnpjs.length > 0) {
    target.branchCnpjs = branchCnpjs;
    target.branchCount = branchCnpjs.length;
    const preferredCnpj = branchCnpjs[0];
    if (!target.cnpj || preferredCnpj !== target.cnpj) {
      target.cnpj = preferredCnpj;
      target.id = toId('company', preferredCnpj);
    }
  }

  if (!target.name || (!isHeadquartersCnpj(target.cnpj) && isHeadquartersCnpj(source.cnpj))) {
    target.name = source.name || target.name;
  }

  target.badges = buildBadges(target);
}

function consolidateGroupLinkedCompanies(companies: SocietaryCompany[]): SocietaryCompany[] {
  const companiesByScopeKey = new Map<string, SocietaryCompany>();

  for (const company of companies) {
    const cnpj = normalizeCnpj(company.cnpj || '');
    const key =
      company.relationshipScope === 'unconfirmed' && !isValidCnpj(cnpj)
        ? company.id
        : isValidCnpj(cnpj)
          ? `cnpj-root:${cnpj.slice(0, 8)}`
          : company.id;
    const existing = companiesByScopeKey.get(key);
    if (existing) {
      mergeCompanyRecords(existing, company);
      continue;
    }
    companiesByScopeKey.set(key, company);
  }

  return Array.from(companiesByScopeKey.values());
}

function hasGroupContext(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  const rootCnpj = normalizeCnpj(root.cnpj || '');
  const companyRootCnpj = normalizeCnpj(company.rootCnpj || '');
  const rootName = normalizeText(root.name);
  const companyRootName = normalizeText(company.rootCompanyName || '');
  const metadataMatchesRoot =
    (isValidCnpj(rootCnpj) && companyRootCnpj === rootCnpj) ||
    Boolean(rootName && companyRootName && companyRootName === rootName);

  return company.rootContext === true && metadataMatchesRoot;
}

function hasEnoughEvidence(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  const confidence = company.confidence || 'weak';
  const hasSource = Boolean(company.sourceUrl || company.sourceTitle || company.snippet);
  const hasCnpj = isValidCnpj(company.cnpj || '');
  const evidenceType = company.evidenceType || 'web';
  const relationshipScope = company.relationshipScope || 'group_link';

  if (relationshipScope === 'partner_other_cnpj') {
    return hasCnpj && hasSource && confidence !== 'weak';
  }
  if (relationshipScope === 'unconfirmed') {
    return (hasCnpj || Boolean(company.rawCnpjLabel?.trim())) && hasSource;
  }
  if (!hasGroupContext(company, root)) return false;
  if (hasCnpj && hasSource) return true;
  if (confidence === 'official' || confidence === 'strong') return hasSource;
  if (evidenceType === 'institutional' && company.sourceUrl && company.snippet) {
    return true;
  }

  return false;
}

function hasEnoughGeminiEvidence(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  if (company.relationshipScope === 'unconfirmed') return hasEnoughEvidence(company, root);
  const hasCnpj = isValidCnpj(company.cnpj || '');
  if (!hasCnpj) return false;
  return hasEnoughEvidence(company, root);
}

function buildBadges(company: SocietaryCompany): SocietaryBadge[] {
  const badges = new Set<SocietaryBadge>();
  const role = normalizeText(company.role || company.name);
  const country = (company.country || 'BR').toUpperCase();

  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') {
    badges.add('validar');
  }
  if (country && country !== 'BR') badges.add('internacional');
  if (/colombia|colômbia/i.test(company.name)) badges.add('internacional');
  if (role.includes('holding') || role.includes('participa') || role.includes('invest')) badges.add('holding');
  if (
    (company.evidenceType === 'registry' || company.evidenceType === 'qsa') &&
    company.relationshipScope !== 'unconfirmed' &&
    company.relationshipScope !== 'partner_other_cnpj' &&
    company.validationStatus !== 'pending'
  )
    badges.add('oficial');
  if (company.confidence === 'weak') badges.add('validar');

  return Array.from(badges);
}

export function buildSocietaryGraph(
  input: BuildSocietaryGraphInput,
  geminiCnpjs?: SocietaryCompanyInput[],
): SocietaryGraph {
  const partners: SocietaryPartner[] = input.partners
    .filter(partner => partner.name.trim())
    .map(partner => ({
      id: partner.id || toId('partner', partner.name),
      name: partner.name.trim(),
      role: partner.role?.trim() || undefined,
      document: partner.document?.trim() || undefined,
      sourceTitle: partner.sourceTitle?.trim() || undefined,
      confidence: partner.confidence || 'official',
    }));

  const partnerByName = new Map<string, SocietaryPartner>();
  for (const partner of partners) {
    partnerByName.set(normalizeText(partner.name), partner);
  }

  const rejectedCompanies: RejectedSocietaryCompany[] = [];
  const companiesByKey = new Map<string, SocietaryCompany>();
  const cnpjIndex = new Map<string, SocietaryCompany>();
  const radicalIndex = new Map<string, SocietaryCompany>();
  const rootBranchCnpjs = new Set<string>();
  const rootCnpj = normalizeCnpj(input.root.cnpj || '');

  for (const company of input.companies || []) {
    const normalizedPartnerName = normalizeText(company.partnerName);
    const partner = partnerByName.get(normalizedPartnerName);
    if (!partner && normalizedPartnerName) {
      rejectedCompanies.push({ input: company, reason: 'Socio nao encontrado para conectar empresa.' });
      continue;
    }

    const relationshipScope = company.relationshipScope || 'group_link';
    const normalizedCnpj = normalizeCnpj(company.cnpj || '');

    if (normalizedCnpj && !isValidCnpj(normalizedCnpj)) {
      rejectedCompanies.push({ input: company, reason: 'CNPJ invalido; empresa nao renderizada.' });
      continue;
    }

    if (relationshipScope === 'partner_other_cnpj' && !partner) {
      rejectedCompanies.push({
        input: company,
        reason: 'CNPJ lateral do socio sem socio confirmado para conectar empresa.',
      });
      continue;
    }

    if (relationshipScope === 'unconfirmed' && !partner && company.rootContext !== true) {
      rejectedCompanies.push({
        input: company,
        reason: 'CNPJ pendente sem socio ou contexto confirmado para renderizar.',
      });
      continue;
    }

    if (!hasMeaningfulCompanyName(company.name)) {
      rejectedCompanies.push({ input: company, reason: 'Nome de empresa truncado ou sem identidade real.' });
      continue;
    }

    if (isRootEstablishment(company, input.root)) {
      rejectedCompanies.push({
        input: company,
        reason: 'CNPJ da propria matriz ou filial da raiz; nao renderizado como empresa relacionada.',
      });
      if (isValidCnpj(normalizedCnpj)) {
        if (!isHeadquartersCnpj(normalizedCnpj)) rootBranchCnpjs.add(normalizedCnpj);
      } else {
        const nameKey = normalizeText(company.name);
        if (nameKey) rootBranchCnpjs.add(nameKey);
      }
      continue;
    }

    if (relationshipScope === 'group_link' && !hasGroupContext(company, input.root)) {
      rejectedCompanies.push({ input: company, reason: 'Possivel homonimo sem contexto suficiente do grupo.' });
      continue;
    }

    if (!hasEnoughEvidence(company, input.root)) {
      rejectedCompanies.push({ input: company, reason: 'Possivel homonimo sem fonte suficiente.' });
      continue;
    }

    const key = buildCompanyKey(company);
    const existing =
      companiesByKey.get(key) ||
      findCompanyByExactCnpj(cnpjIndex, normalizedCnpj) ||
      findCompanyByCnpjRadical(radicalIndex, normalizedCnpj);
    if (existing) {
      if (partner && !existing.partnerIds.includes(partner.id)) existing.partnerIds.push(partner.id);
      if (relationshipScope === 'group_link') existing.rootLinked = true;
      if (shouldPromoteEvidence(existing, company)) {
        existing.confidence = company.confidence || existing.confidence;
        existing.evidenceType = company.evidenceType || existing.evidenceType;
        existing.relationshipScope = company.relationshipScope || existing.relationshipScope;
        existing.validationStatus = company.validationStatus || existing.validationStatus;
        existing.rootContext = company.rootContext ?? existing.rootContext;
        existing.rootCompanyName = company.rootCompanyName || existing.rootCompanyName;
        existing.rootCnpj = normalizeCnpj(company.rootCnpj || '') || existing.rootCnpj;
        existing.sourceTitle = company.sourceTitle || existing.sourceTitle;
        existing.sourceUrl = company.sourceUrl || existing.sourceUrl;
        existing.snippet = company.snippet || existing.snippet;
        existing.rawCnpjLabel = company.rawCnpjLabel || existing.rawCnpjLabel;
      }
      mergeBranchData(existing, company);
      existing.badges = buildBadges(existing);
      continue;
    }

    const created: SocietaryCompany = {
      id: toId('company', normalizedCnpj || `${company.name}-${company.country || 'BR'}`),
      name: company.name.trim(),
      cnpj: isValidCnpj(normalizedCnpj) ? normalizedCnpj : undefined,
      rawCnpjLabel: company.rawCnpjLabel?.trim() || undefined,
      branchCount: isValidCnpj(normalizedCnpj) ? company.branchCount || 1 : undefined,
      branchCnpjs: isValidCnpj(normalizedCnpj)
        ? company.branchCnpjs?.length
          ? company.branchCnpjs
          : [normalizedCnpj]
        : undefined,
      country: company.country?.trim().toUpperCase() || undefined,
      role: company.role?.trim() || undefined,
      sourceTitle: company.sourceTitle?.trim() || undefined,
      sourceUrl: company.sourceUrl?.trim() || undefined,
      snippet: company.snippet?.trim() || undefined,
      confidence: company.confidence || 'weak',
      evidenceType: company.evidenceType || 'web',
      relationshipScope,
      validationStatus: company.validationStatus,
      rootContext: hasGroupContext(company, input.root),
      rootCompanyName: company.rootCompanyName?.trim() || undefined,
      rootCnpj: normalizeCnpj(company.rootCnpj || '') || undefined,
      partnerIds: partner ? [partner.id] : [],
      rootLinked: relationshipScope === 'group_link',
      badges: [],
    };
    created.badges = buildBadges(created);
    companiesByKey.set(key, created);
    {
      const normalized = normalizeCnpj(created.cnpj || '');
      if (isValidCnpj(normalized)) {
        cnpjIndex.set(normalized, created);
        radicalIndex.set(normalized.slice(0, 8), created);
      }
    }
  }

  if (geminiCnpjs) {
    for (const geminiCompany of geminiCnpjs) {
      if (!geminiCompany.name.trim()) continue;

      const geminiCandidate: SocietaryCompanyInput = {
        ...geminiCompany,
        rootCompanyName:
          geminiCompany.rootContext === true
            ? geminiCompany.rootCompanyName || input.root.name
            : geminiCompany.rootCompanyName,
        rootCnpj:
          geminiCompany.rootContext === true ? geminiCompany.rootCnpj || input.root.cnpj : geminiCompany.rootCnpj,
      };

      if (!hasMeaningfulCompanyName(geminiCandidate.name)) {
        rejectedCompanies.push({ input: geminiCandidate, reason: 'Nome de empresa truncado ou sem identidade real.' });
        continue;
      }

      const normalizedCnpj = normalizeCnpj(geminiCandidate.cnpj || '');
      if (normalizedCnpj && !isValidCnpj(normalizedCnpj)) {
        rejectedCompanies.push({ input: geminiCandidate, reason: 'CNPJ invalido; empresa Gemini nao renderizada.' });
        continue;
      }

      const relationshipScope = geminiCandidate.relationshipScope || 'group_link';
      const partner = partnerByName.get(normalizeText(geminiCandidate.partnerName || ''));
      if (relationshipScope === 'partner_other_cnpj' && !partner) {
        rejectedCompanies.push({
          input: geminiCandidate,
          reason: 'CNPJ lateral do socio sem socio confirmado para conectar empresa.',
        });
        continue;
      }

      if (relationshipScope === 'unconfirmed' && !partner && geminiCandidate.rootContext !== true) {
        rejectedCompanies.push({
          input: geminiCandidate,
          reason: 'CNPJ pendente sem socio ou contexto confirmado para renderizar.',
        });
        continue;
      }

      if (isRootEstablishment(geminiCandidate, input.root)) {
        rejectedCompanies.push({
          input: geminiCandidate,
          reason: 'CNPJ da propria matriz ou filial da raiz; nao renderizado como empresa relacionada.',
        });
        if (isValidCnpj(normalizedCnpj)) {
          if (!isHeadquartersCnpj(normalizedCnpj)) rootBranchCnpjs.add(normalizedCnpj);
        } else {
          const nameKey = normalizeText(geminiCandidate.name);
          if (nameKey) rootBranchCnpjs.add(nameKey);
        }
        continue;
      }

      if (!hasEnoughGeminiEvidence(geminiCandidate, input.root)) {
        rejectedCompanies.push({
          input: geminiCandidate,
          reason: 'Empresa Gemini sem CNPJ valido ou evidencia suficiente.',
        });
        continue;
      }

      const hasValidCnpj = isValidCnpj(normalizedCnpj);

      let merged = false;
      if (hasValidCnpj) {
        const existingKey = buildCompanyKey(geminiCandidate);
        const existing =
          companiesByKey.get(existingKey) ||
          findCompanyByExactCnpj(cnpjIndex, normalizedCnpj) ||
          findCompanyByCnpjRadical(radicalIndex, normalizedCnpj);
        if (existing) {
          if (!isHeadquartersCnpj(existing.cnpj) || isHeadquartersCnpj(normalizedCnpj)) {
            existing.name = geminiCandidate.name.trim();
          }
          existing.role = geminiCandidate.role || existing.role;
          existing.sourceTitle = geminiCandidate.sourceTitle || existing.sourceTitle;
          if (shouldPromoteEvidence(existing, geminiCandidate)) {
            existing.confidence = geminiCandidate.confidence || existing.confidence;
            existing.evidenceType = geminiCandidate.evidenceType || existing.evidenceType;
            existing.relationshipScope = geminiCandidate.relationshipScope || existing.relationshipScope;
            existing.validationStatus = geminiCandidate.validationStatus || existing.validationStatus;
            existing.rawCnpjLabel = geminiCandidate.rawCnpjLabel || existing.rawCnpjLabel;
            existing.rootContext = geminiCandidate.rootContext ?? existing.rootContext;
          }
          mergeBranchData(existing, geminiCandidate);
          if (partner && !existing.partnerIds.includes(partner.id)) existing.partnerIds.push(partner.id);
          if (relationshipScope === 'group_link') existing.rootLinked = true;
          existing.badges = buildBadges(existing);
          merged = true;
        }
      }

      if (!merged) {
        const partnerIds: string[] = partner ? [partner.id] : [];
        const created: SocietaryCompany = {
          id: toId('company', hasValidCnpj ? normalizedCnpj : geminiCompany.name),
          name: geminiCandidate.name.trim(),
          cnpj: hasValidCnpj ? normalizedCnpj : undefined,
          rawCnpjLabel: geminiCandidate.rawCnpjLabel?.trim() || undefined,
          branchCount: hasValidCnpj ? geminiCandidate.branchCount || 1 : undefined,
          branchCnpjs: hasValidCnpj
            ? geminiCandidate.branchCnpjs?.length
              ? geminiCandidate.branchCnpjs
              : [normalizedCnpj]
            : undefined,
          country: geminiCandidate.country?.trim().toUpperCase() || undefined,
          role: geminiCandidate.role?.trim() || undefined,
          sourceTitle: geminiCandidate.sourceTitle?.trim() || undefined,
          sourceUrl: geminiCandidate.sourceUrl?.trim() || undefined,
          snippet: geminiCandidate.snippet?.trim() || undefined,
          confidence: geminiCandidate.confidence || (hasValidCnpj ? 'strong' : 'weak'),
          evidenceType: geminiCandidate.evidenceType || (hasValidCnpj ? 'qsa' : 'web'),
          relationshipScope,
          validationStatus: geminiCandidate.validationStatus,
          rootContext: geminiCandidate.rootContext ?? true,
          partnerIds,
          rootLinked: relationshipScope === 'group_link',
          badges: [],
        };
        created.badges = buildBadges(created);
        companiesByKey.set(buildCompanyKey(geminiCandidate), created);
        {
          const normalized = normalizeCnpj(created.cnpj || '');
          if (isValidCnpj(normalized)) {
            cnpjIndex.set(normalized, created);
            radicalIndex.set(normalized.slice(0, 8), created);
          }
        }
      }
    }
  }

  const companies = consolidateGroupLinkedCompanies(Array.from(companiesByKey.values()));
  return {
    root: {
      id: 'root',
      name: input.root.name.trim(),
      cnpj: isValidCnpj(rootCnpj) ? rootCnpj : undefined,
    },
    partners,
    companies,
    rejectedCompanies,
    rootBranchCount: rootBranchCnpjs.size,
  };
}
