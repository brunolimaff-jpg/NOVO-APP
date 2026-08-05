import { z } from 'zod';
import { scoutDiag } from '../../utils/diagnosticLog';

// === TIPOS INLINE (Principio 17) ===

export type ScoutSegment =
  | 'agropecuaria'
  | 'agroindustria'
  | 'construcao'
  | 'logistica'
  | 'hcm_intensivo'
  | 'industrial_geral';
export type EvidenceTier = 'A' | 'B' | 'C' | 'D';
export type EntityType = 'exact' | 'likely' | 'weak' | 'rejected';
export type DossierModule =
  | 'teia_identity'
  | 'teia_deep'
  | 'inteligencia_operacional'
  | 'compliance_risco_fiscal'
  | 'caminho_venda'
  | 'arquitetura_ti';

export interface EntityResolution {
  cnpjRaiz: string;
  razaoSocial: string;
  cnaePrincipal: string;
  clienteSeniorData?: { encontrado?: boolean; totalModulos?: number; familias?: string[] };
  segmentoInferido: ScoutSegment;
  estadoOperacao: string[];
}

export interface PlannedQuery {
  id: string;
  query: string;
  objective: string;
  module: DossierModule;
  priority: 1 | 2 | 3;
  expectedSource: EvidenceTier;
  homonimRisk: 'baixo' | 'medio' | 'alto';
  rationale: string;
}

export interface QueryPlan {
  entityResolutionId: string;
  segmento: ScoutSegment;
  queries: PlannedQuery[];
  generatedAt: string;
}

export interface BraveSearchResult {
  queryId: string;
  query: string;
  url: string;
  title: string;
  snippet: string;
  provider: 'web' | 'duckduckgo';
  retrievedAt: string;
}

export interface EvidenceItem {
  id: string;
  sourceResult: BraveSearchResult;
  evidenceTier: EvidenceTier;
  entityMatch: EntityType;
  usableForReport: boolean;
  reasonIfRejected?: string;
  queryOrigin: string;
  module: DossierModule;
  extractedClaim: string;
}

export interface EvidencePack {
  items: EvidenceItem[];
  confidenceProfile: {
    totalUrls: number;
    uniqueUrls: number;
    tierACount: number;
    tierBCount: number;
    tierCCount: number;
    tierDCount: number;
    modulesCovered: DossierModule[];
  };
  collectedAt: string;
}

// === HELPER: extrai EntityResolution do contexto do waterfall ===

export function buildEntityResolutionFromContext(ctx: {
  cnpj?: string;
  razaoSocial?: string;
  cnaePrincipal?: string;
  clienteSeniorData?: EntityResolution['clienteSeniorData'];
  estadoOperacao?: string[];
}): EntityResolution {
  const cnae = ctx.cnaePrincipal || '';
  const razao = (ctx.razaoSocial || '').toLowerCase();
  let segmento: ScoutSegment = 'industrial_geral';

  if (/^01|^0111|^015|^016|^021/.test(cnae) || /fazenda|agro|soja|milho|algod/.test(razao)) segmento = 'agropecuaria';
  else if (/^10|^11/.test(cnae) || /usina|moinho|algodoeira/.test(razao)) segmento = 'agroindustria';
  else if (/^41|^42|^43/.test(cnae) || /constru|incorpora/.test(razao)) segmento = 'construcao';
  else if (/^49|^50|^52|^53/.test(cnae) || /log[ií]st|transport|frota/.test(razao)) segmento = 'logistica';

  return {
    cnpjRaiz: ctx.cnpj || '',
    razaoSocial: ctx.razaoSocial || 'Empresa não identificada',
    cnaePrincipal: cnae,
    clienteSeniorData: ctx.clienteSeniorData,
    segmentoInferido: segmento,
    estadoOperacao: ctx.estadoOperacao || [],
  };
}

// === PROMPT INLINE (Principio 17) ===

const PLANNER_PROMPT = `Você é o PLANEJADOR DE INVESTIGAÇÃO do Scout 360.
NÃO escreve análise comercial. NÃO busca. Só planeja queries.

ENTRADA:
- Empresa: {companyName}
- CNPJ: {cnpjRaiz}
- CNAE: {cnaePrincipal}
- Segmento: {segmentoInferido}
- Cliente Senior: {clienteSenior}

SAÍDA: Retorne EXCLUSIVAMENTE um objeto JSON dentro de um bloco \`\`\`json:

\`\`\`json
{
  "queries": [
    {
      "id": "q-01",
      "query": "string de busca otimizada",
      "objective": "identity_resolution|cnpj_qsa|group_structure|operational_footprint|tech_stack|compliance_risk|commercial_trigger|senior_offer_fit",
      "module": "teia_identity|teia_deep|inteligencia_operacional|compliance_risco_fiscal|caminho_venda|arquitetura_ti",
      "priority": 1,
      "expectedSource": "A",
      "homonimRisk": "baixo",
      "rationale": "por que esta query"
    }
  ]
}
\`\`\`

REGRAS OBRIGATÓRIAS:
- Gere entre 12 e 18 queries (não mais, não menos)
- Para agropecuaria: inclua queries com "hectares", "CAR", "SIGEF", "safra", "BCI", "IBAMA", "SEMA"
- Para outros segmentos: adapte vocabulário (construção=CNO/obra/alvará, logística=frota/CD/3PL, HCM=headcount/eSocial/RAIS)
- Prioridade 1: sempre incluir identity_resolution + cnpj_qsa (obrigatórias)
- expectedSource "A": URLs .gov.br, .jus.br, cnpj.ws, receita federal
- Não invente CNPJs — só use o {cnpjRaiz} fornecido
- NÃO repita queries idênticas
- rationale deve explicar em 1 frase por que esta query ajuda o dossiê

EXEMPLOS (adapte, não copie):
- Agro: '{companyName} hectares "Mato Grosso" OR "Maranhão"'
- Construção: 'site:gov.br "{companyName}" CNO OR CEI'
- HCM: '{companyName} eSocial OR RAIS OR CAGED'

IMPORTANTE: Sua resposta DEVE começar com \`\`\`json e terminar com \`\`\`. NADA de texto fora do bloco.`;

function renderPlannerPrompt(entity: EntityResolution): string {
  return PLANNER_PROMPT.split('{companyName}')
    .join(entity.razaoSocial)
    .split('{cnpjRaiz}')
    .join(entity.cnpjRaiz)
    .split('{cnaePrincipal}')
    .join(entity.cnaePrincipal)
    .split('{segmentoInferido}')
    .join(entity.segmentoInferido)
    .split('{clienteSenior}')
    .join(entity.clienteSeniorData?.encontrado ? 'SIM' : 'NÃO');
}

// === Zod schema ===

const QueryPlanSchema = z.object({
  queries: z
    .array(
      z.object({
        id: z.string(),
        query: z.string().min(5),
        objective: z.enum([
          'identity_resolution',
          'cnpj_qsa',
          'group_structure',
          'operational_footprint',
          'tech_stack',
          'compliance_risk',
          'commercial_trigger',
          'senior_offer_fit',
        ]),
        module: z.enum([
          'teia_identity',
          'teia_deep',
          'inteligencia_operacional',
          'compliance_risco_fiscal',
          'caminho_venda',
          'arquitetura_ti',
        ]),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        expectedSource: z.enum(['A', 'B', 'C', 'D']),
        homonimRisk: z.enum(['baixo', 'medio', 'alto']),
        rationale: z.string().min(10),
      }),
    )
    .min(12)
    .max(18),
});

// === PLANNER ===

export async function planQueries(
  entity: EntityResolution,
  callLLM: (prompt: string) => Promise<string>,
): Promise<QueryPlan> {
  const raw = await callLLM(renderPlannerPrompt(entity));

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Corrige vírgula faltando entre objetos do array (erro comum de LLM)
  const repaired = cleaned
    .replace(/}(\s*)\{/g, '},$1{')
    // Corrige array não fechado: } no final sem ] antes (o modelo esquece de fechar queries[])
    .replace(/(\})\s*\}$/g, '$1\n  ]\n}');

  const extractJson = (text: string): string | null => {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return text.slice(first, last + 1);
    }
    return null;
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch {
    let ok = false;
    let lastParseError = '';
    try {
      const ext = extractJson(repaired);
      if (ext) {
        parsed = JSON.parse(ext);
        ok = true;
      }
    } catch (e) {
      lastParseError = e instanceof Error ? e.message : String(e);
    }
    if (!ok) {
      try {
        const match = repaired.match(/\{[\s\S]*\}/);
        if (match) {
          const ext = extractJson(match[0]) || match[0];
          parsed = JSON.parse(ext);
          ok = true;
        }
      } catch (e) {
        lastParseError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!ok) {
      // Tenta fechar JSON truncado (o modelo cortou resposta no meio)
      try {
        const ext = extractJson(repaired);
        if (ext && !ext.endsWith('}') && !ext.endsWith(']')) {
          parsed = JSON.parse(ext + '}]');
          ok = true;
        }
      } catch (e) {
        lastParseError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!ok) {
      console.error('[QueryPlanner] parseError:', lastParseError);
      console.error('[QueryPlanner] raw:', raw.slice(0, 2000));
      console.error('[QueryPlanner] repaired:', repaired.slice(0, 2000));
      // Loga ao redor do erro (100 chars antes/depois)
      const errPos = parseInt(lastParseError.match(/position (\d+)/)?.[1] || '0', 10);
      console.error('[QueryPlanner] around-error:', repaired.slice(Math.max(0, errPos - 100), errPos + 100));
      throw new Error(`Planner retornou JSON inválido: ${lastParseError}`);
    }
  }

  // Normaliza campos que o modelo pode gerar com acento/maiúscula/string
  if (parsed && typeof parsed === 'object' && 'queries' in parsed) {
    const obj = parsed as { queries: Array<Record<string, unknown>> };
    for (const q of obj.queries) {
      if (typeof q.homonimRisk === 'string') {
        q.homonimRisk = q.homonimRisk.toLowerCase().replace('é', 'e').replace('ê', 'e');
      }
      if (typeof q.objective === 'string') q.objective = q.objective.toLowerCase();
      if (typeof q.module === 'string') q.module = q.module.toLowerCase().replace('ê', 'e');
      if (typeof q.priority === 'string') q.priority = Number(q.priority);
    }
  }

  const validated = QueryPlanSchema.parse(parsed);

  return {
    entityResolutionId: entity.cnpjRaiz,
    segmento: entity.segmentoInferido,
    queries: validated.queries.slice(0, 18),
    generatedAt: new Date().toISOString(),
  };
}

// === COLLECTOR ===

export async function executeQueryPlan(plan: QueryPlan): Promise<EvidencePack> {
  const concurrency = 4;
  const allResults: BraveSearchResult[] = [];

  for (let i = 0; i < plan.queries.length; i += concurrency) {
    const batch = plan.queries.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async q => {
        try {
          const response = await fetch('/api/open-web-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q.query }),
          });
          if (!response.ok) return [];
          const data = await response.json();
          const raw = data.content || '';
          if (!raw) return [];

          const blocks = raw.split(/\n---\n/).filter(Boolean);
          return blocks
            .map(block => {
              const urlMatch = block.match(/^URL:\s*(.+)$/m);
              const titleMatch = block.match(/^Título:\s*(.+)$/m);
              const resumoMatch = block.match(/^Resumo:\s*([\s\S]+?)(?:\n---|\n$|$)/m);
              if (!urlMatch) return null;
              return {
                queryId: q.id,
                query: q.query,
                url: urlMatch[1].trim(),
                title: titleMatch?.[1].trim() || urlMatch[1].trim(),
                snippet: resumoMatch?.[1].trim().slice(0, 1000) || '',
                provider: 'web' as const,
                retrievedAt: new Date().toISOString(),
              } as BraveSearchResult;
            })
            .filter((r): r is BraveSearchResult => r !== null);
        } catch (err) {
          scoutDiag.warn('QueryPlanner', 'busca falhou na query', { queryId: q.id, error: String(err) });
          return [];
        }
      }),
    );

    for (const r of settled) {
      if (r.status === 'fulfilled') allResults.push(...r.value);
    }
  }

  const items: EvidenceItem[] = allResults.map((r, i) => {
    const tier = classifyTier(r.url);
    const match = classifyEntityMatch(r.snippet, plan.entityResolutionId);
    const usable = tier !== 'D' && match !== 'rejected';
    return {
      id: `ev-${String(i + 1).padStart(3, '0')}`,
      sourceResult: r,
      evidenceTier: tier,
      entityMatch: match,
      usableForReport: usable,
      reasonIfRejected: usable ? undefined : `Tier ${tier} ou match ${match}`,
      queryOrigin: r.queryId,
      module: plan.queries.find(q => q.id === r.queryId)?.module || 'teia_identity',
      extractedClaim: r.snippet.slice(0, 200),
    };
  });

  const usableItems = items.filter(i => i.usableForReport);

  return {
    items,
    confidenceProfile: {
      totalUrls: items.length,
      uniqueUrls: new Set(items.map(i => i.sourceResult.url)).size,
      tierACount: items.filter(i => i.evidenceTier === 'A').length,
      tierBCount: items.filter(i => i.evidenceTier === 'B').length,
      tierCCount: items.filter(i => i.evidenceTier === 'C').length,
      tierDCount: items.filter(i => i.evidenceTier === 'D').length,
      modulesCovered: [...new Set(usableItems.map(i => i.module))] as DossierModule[],
    },
    collectedAt: new Date().toISOString(),
  };
}

function classifyTier(url: string): EvidenceTier {
  try {
    const u = url.toLowerCase();
    if (/\.(gov|jus)\.br/.test(u) || /cnpj\.ws/.test(u)) return 'A';
    if (/blog|news|imprensa/.test(u)) return 'C';
    if (/\.com\.br$/.test(new URL(url).hostname)) return 'B';
  } catch {
    // URL parse pode falhar com strings malformadas
  }
  return 'D';
}

function classifyEntityMatch(snippet: string, cnpj: string): EntityType {
  if (!cnpj) return 'likely';
  const cnpjClean = cnpj.replace(/\D/g, '');
  if (!cnpjClean) return 'likely';
  if (snippet.includes(cnpjClean) || snippet.includes(cnpj)) return 'exact';
  return 'likely'; // stub — Fase 2 melhorar
}
