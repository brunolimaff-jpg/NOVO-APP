import { sanitizeSensitivePersonalData } from './privacy';

export type SocioRuralEvidenceStatus = 'confirmado' | 'possivel' | 'homonimo_rejeitado';

export interface SocioRuralEvidence {
  name: string;
  status: SocioRuralEvidenceStatus;
  reason: string;
}

const RURAL_TERMS = [
  'produtor rural',
  'produtora rural',
  'caepf',
  'lcdpr',
  'fazenda',
  'agropecuaria',
  'agropecuária',
  'imovel rural',
  'imóvel rural',
  'car',
  'sigef',
  'holding patrimonial',
  'condominio agricola',
  'condomínio agrícola',
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function cleanPersonName(value: string): string {
  return value
    .replace(/\b(CPF|CNPJ|RG|CAEPF)\b.*$/i, '')
    .replace(/[.;]\s*(S[oó]ci[oa]|Administrador(?:a)?|Diretor(?:a)?|Fundador(?:a)?|QSA)\b.*$/i, '')
    .replace(/[.;,|]+$/g, '')
    .trim();
}

export function extractPotentialSocioNames(text: string): string[] {
  if (!text) return [];
  const names: string[] = [];
  const rolePattern = /(?:s[oó]ci[oa]|administrador(?:a)?|diretor(?:a)?|fundador(?:a)?|qsa)\s*(?:administrador(?:a)?|controlador(?:a)?|rural)?\s*[:\-–—]?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç'.-]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç'.-]+){1,5})/g;
  let match: RegExpExecArray | null;
  while ((match = rolePattern.exec(text)) !== null) {
    const name = cleanPersonName(match[1]);
    if (name.split(/\s+/).length >= 2) names.push(name);
  }

  const familyPattern = /\bFam[ií]lia\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç'.-]+)/g;
  while ((match = familyPattern.exec(text)) !== null) {
    names.push(`Família ${match[1]}`);
  }

  return unique(names).slice(0, 8);
}

export function buildSocioRuralSearchQueries(companyName: string, contextText = ''): string[] {
  const company = companyName.trim();
  if (!company) return [];

  const names = extractPotentialSocioNames(contextText);
  const baseQueries = [
    `"${company}" ("QSA" OR "sócios" OR "administradores" OR "produtor rural" OR "CAEPF" OR "LCDPR")`,
    `"${company}" ("fazenda" OR "agropecuária" OR "imóvel rural" OR "CAR" OR "SIGEF" OR "holding patrimonial")`,
  ];

  const peopleQueries = names.flatMap(name => [
    `"${name}" "${company}" ("produtor rural" OR "CAEPF" OR "LCDPR" OR "fazenda")`,
    `"${name}" ("holding patrimonial" OR "agropecuária" OR "imóvel rural" OR "CAR" OR "SIGEF")`,
  ]);

  return unique([...baseQueries, ...peopleQueries]).slice(0, 8);
}

export function classifySocioRuralEvidence(name: string, companyName: string, content: string): SocioRuralEvidence {
  const normalizedContent = normalize(content);
  const normalizedName = normalize(name);
  const normalizedCompany = normalize(companyName);
  const hasName = normalizedName.split(/\s+/).every(part => normalizedContent.includes(part));
  const hasCompany = normalizedCompany
    .split(/\s+/)
    .filter(part => part.length > 2)
    .some(part => normalizedContent.includes(part));
  const ruralHits = RURAL_TERMS.filter(term => normalizedContent.includes(normalize(term)));

  if (hasName && ruralHits.length >= 2 && hasCompany) {
    return {
      name,
      status: 'confirmado',
      reason: `Nome conectado ao grupo e a sinais rurais: ${ruralHits.slice(0, 3).join(', ')}.`,
    };
  }

  if (hasName && ruralHits.length > 0) {
    return {
      name,
      status: 'possivel',
      reason: `Nome apareceu com sinal rural, mas a conexão com o grupo exige validação: ${ruralHits[0]}.`,
    };
  }

  return {
    name,
    status: 'homonimo_rejeitado',
    reason: 'Resultado sem conexão suficiente entre nome, grupo e contexto rural.',
  };
}

export function buildSocioRuralInstructionContext(companyName: string, contextText = ''): string {
  const queries = buildSocioRuralSearchQueries(companyName, contextText);
  if (queries.length === 0) return '';

  return sanitizeSensitivePersonalData(
    [
      'Matriz segura de pesquisa societária rural inspirada em OSINT defensivo:',
      '- Use apenas fontes públicas e verificáveis.',
      '- Não exponha CPF completo; se uma fonte pública trouxer CPF, mascarar como CPF xxx.xxx.123-xx.',
      '- Classifique sócio produtor rural apenas como confirmado, possivel ou homonimo_rejeitado.',
      '- Rejeite homônimos quando não houver conexão entre nome, grupo, geografia e contexto rural.',
      '- Não use telefone, e-mail pessoal, proxies/Tor, enumeração ofensiva ou dados não públicos.',
      ...queries.map(query => `- ${query}`),
    ].join('\n'),
  );
}
