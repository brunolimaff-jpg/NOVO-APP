import { scoutDiag } from '../diagnosticLog';

interface BraveWebResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResponse {
  results?: BraveWebResult[];
  sources?: BraveWebResult[];
  error?: string;
}

export interface WebSearchDossierResult {
  /** Resultados brutos agrupados por dimensão */
  holding?: BraveWebResult[];
  faturamento?: BraveWebResult[];
  area?: BraveWebResult[];
  internacional?: BraveWebResult[];
  tecnologia?: BraveWebResult[];

  /** Bloco formatado para injeção no prompt do LLM */
  groundingBlock: string;
}

function toPlainText(value: string): string {
  const document = new DOMParser().parseFromString(value, 'text/html');
  document
    .querySelectorAll('script, style, template, noscript, iframe, object, embed, svg, math')
    .forEach(node => node.remove());
  const printableText = Array.from(document.body.textContent ?? '')
    .filter(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join('');

  return printableText.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (/[<>]/.test(value)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function searchOne(query: string): Promise<BraveWebResult[]> {
  try {
    const response = await fetch('/api/open-web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      scoutDiag.warn('WebSearch', `query falhou (${response.status})`, { query });
      return [];
    }

    const data = (await response.json()) as WebSearchResponse & {
      _debug?: { hasBraveKey?: boolean; braveAttempted?: boolean };
    };
    if (data._debug) {
      scoutDiag.info('WebSearch', 'diagnóstico do servidor', data._debug);
    }
    return (data.results ?? data.sources ?? []).map(r => ({
      title: toPlainText(r.title),
      url: normalizeExternalUrl(r.url),
      snippet: toPlainText(r.snippet),
    }));
  } catch (error) {
    scoutDiag.warn('WebSearch', 'erro de rede na query', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

interface DossierQueries {
  holding: string;
  faturamento: string;
  area: string;
  internacional: string;
  tecnologia: string;
}

function buildQueries(empresa: string): DossierQueries {
  const base = empresa.trim();
  return {
    holding: `"${base}" holding grupo econômico controladora`,
    faturamento: `"${base}" faturamento receita resultado financeiro`,
    area: `"${base}" área hectares fazendas produção agrícola`,
    internacional: `"${base}" exportação internacional Colômbia Paraguai operações exterior`,
    tecnologia: `"${base}" ERP sistema gestão tecnologia SAP TOTVS Senior`,
  };
}

function formatGroundingBlock(result: WebSearchDossierResult, empresa: string): string {
  const sections: string[] = [];
  sections.push(`[RESULTADOS DE WEB SEARCH — Brave Search para "${empresa}"]`);
  sections.push('');

  const dims: Array<{ key: keyof WebSearchDossierResult; label: string; results?: BraveWebResult[] }> = [
    { key: 'holding', label: 'Holding / Grupo Econômico', results: result.holding },
    { key: 'faturamento', label: 'Faturamento / Receita', results: result.faturamento },
    { key: 'area', label: 'Área / Operação Agrícola', results: result.area },
    { key: 'internacional', label: 'Operações Internacionais', results: result.internacional },
    { key: 'tecnologia', label: 'Tecnologia / ERP', results: result.tecnologia },
  ];

  for (const dim of dims) {
    if (!dim.results || dim.results.length === 0) {
      sections.push(`### ${dim.label}: Nenhum resultado público relevante encontrado.`);
    } else {
      sections.push(`### ${dim.label}:`);
      for (const r of dim.results.slice(0, 3)) {
        sections.push(`- **${r.title}** — ${r.snippet}`);
        sections.push(`  Fonte: ${r.url}`);
      }
    }
    sections.push('');
  }

  sections.push('[FIM DOS RESULTADOS DE WEB SEARCH]');
  sections.push('');
  sections.push('INSTRUÇÃO PARA O MODELO: Use APENAS os fatos concretos acima. Para cada dimensão,');
  sections.push('se há resultados, incorpore-os ao dossiê citando a fonte. Se NÃO há resultados,');
  sections.push('diga "Sem informações públicas relevantes" — NÃO diga "Não encontrado nas fontes públicas".');
  sections.push('NAO invente CNPJs, valores ou fatos que não estejam nos resultados acima.');

  return sections.join('\n');
}

export async function enrichDossierWithWebSearch(empresa: string): Promise<WebSearchDossierResult> {
  const queries = buildQueries(empresa);

  scoutDiag.info('WebSearch', 'iniciando buscas paralelas', { empresa, queries: Object.keys(queries) });

  const [holding, faturamento, area, internacional, tecnologia] = await Promise.all([
    searchOne(queries.holding),
    searchOne(queries.faturamento),
    searchOne(queries.area),
    searchOne(queries.internacional),
    searchOne(queries.tecnologia),
  ]);

  const result: WebSearchDossierResult = {
    holding: holding.length > 0 ? holding : undefined,
    faturamento: faturamento.length > 0 ? faturamento : undefined,
    area: area.length > 0 ? area : undefined,
    internacional: internacional.length > 0 ? internacional : undefined,
    tecnologia: tecnologia.length > 0 ? tecnologia : undefined,
    groundingBlock: '',
  };

  result.groundingBlock = formatGroundingBlock(result, empresa);

  const totalResults = [holding, faturamento, area, internacional, tecnologia].reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  scoutDiag.info('WebSearch', 'buscas concluídas', {
    empresa,
    totalResults,
    holdingCount: holding.length,
    faturamentoCount: faturamento.length,
    areaCount: area.length,
    internacionalCount: internacional.length,
    tecnologiaCount: tecnologia.length,
  });

  return result;
}
