import { normalizeCnpj } from './cnpj.js';
import { scoutDiag } from './diagnosticLog.js';

/**
 * Utilitário Unificado de Extração e Busca
 *
 * Centraliza a lógica de busca web e extração de documentos para ser usada
 * tanto em rotas de API quanto diretamente no backend (bypassando HTTP 401).
 * Usa Lazy Loading para dependências pesadas para evitar erros no Vercel.
 */

export interface UniversalExtractResult {
  text: string;
  length: number;
  source?: string;
  degraded?: boolean;
  error?: string;
}

function stripNullCharacters(input: string): string {
  return input.split('\u0000').join(' ');
}

/**
 * Valida se uma URL é pública e segura para evitar SSRF.
 */
export function isValidPublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
    if (hostname.startsWith('169.254.')) return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Extrai conteúdo limpo de HTML usando Cheerio (Leve e rápido para Serverless).
 */
export async function extractHtml(html: string, limit = 15000): Promise<string> {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  // Remove elementos indesejados
  $('script, style, nav, footer, iframe, noscript, .ads, #ads').remove();

  // Tenta focar no conteúdo principal (heurística simples)
  const mainContent = $('article, main, .content, #content, .post, .article').first();
  const text = mainContent.length ? mainContent.text() : $('body').text();

  return stripNullCharacters(text).replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Extrai texto de buffer PDF.
 */
export async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    return stripNullCharacters(parsed.text || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    scoutDiag.error('DocumentExtractor', 'Erro no PDFParse', e);
    return '[Erro na extração de PDF]';
  }
}

/**
 * Extrai texto de buffer DOCX.
 */
export async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Usa Gemini Search Grounding APENAS para encontrar URLs relevantes.
 * Os CNPJs sao extraidos diretamente do scraping dessas URLs — zero alucinacao.
 * Retorna no formato Título/URL/Resumo/--- compatível com splitSearchBlocks().
 */
export async function performGeminiSearch(query: string, apiKey: string): Promise<string | null> {
  scoutDiag.info('DocumentExtractor', `Buscando URLs via Gemini Search Grounding: ${query}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Find web pages listing Brazilian companies where "${query}" appears as a partner, shareholder, or administrator. Focus on consultasocio.com, econodata.com.br, cnpj.ws, casadosdados.com.br, and similar Brazilian corporate registry sites.`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      scoutDiag.warn('DocumentExtractor', `Gemini API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };
    const groundingMetadata = data?.candidates?.[0]?.groundingMetadata;
    const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> = groundingMetadata?.groundingChunks || [];

    if (groundingChunks.length === 0) {
      scoutDiag.warn('DocumentExtractor', 'Gemini Search: sem URLs de grounding');
      return null;
    }

    const cheerio = await import('cheerio');
    const results: string[] = [];
    const urlSet = new Set<string>();

    for (const chunk of groundingChunks) {
      const url = chunk?.web?.uri || '';
      const title = chunk?.web?.title || '';
      if (!url || urlSet.has(url) || !isValidPublicUrl(url)) continue;
      urlSet.add(url);

      try {
        const pageResponse = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
          signal: AbortSignal.timeout(8000),
        });

        if (!pageResponse.ok) continue;

        const html = await pageResponse.text();
        const $ = cheerio.load(html);
        const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);

        if (!pageText) continue;

        results.push(`Título: ${title}\nURL: ${url}\nResumo: ${pageText}\n---`);
      } catch {
        continue;
      }
    }

    scoutDiag.info('DocumentExtractor', `Gemini Search: ${results.length} paginas extraidas`);
    return results.length > 0 ? results.join('\n') : null;
  } catch (error) {
    scoutDiag.warn('DocumentExtractor', 'Erro na busca Gemini Search', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Realiza busca web via Gemini Search Grounding (se API key disponivel)
 * ou fallback para DuckDuckGo Lite (POST).
 */
export async function performWebSearch(query: string, _options: { count?: number } = {}): Promise<string | null> {
  // Tenta Gemini com grounding primeiro (mais preciso, com fontes verificadas)
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  if (apiKey) {
    const result = await performGeminiSearch(query, apiKey);
    if (result) return result;
    scoutDiag.info('DocumentExtractor', 'Gemini indisponivel, fallback para DuckDuckGo');
  }
  // Fallback para DuckDuckGo
  return performDuckDuckGoSearch(query);
}

async function performDuckDuckGoSearch(query: string): Promise<string | null> {
  const cheerio = await import('cheerio');
  scoutDiag.info('DocumentExtractor', `Buscando no DuckDuckGo (POST): ${query}`);

  try {
    const response = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: string[] = [];

    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      scoutDiag.info(
        'DocumentExtractor',
        `Memória RAM: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.rss / 1024 / 1024)}MB`,
      );
    }

    $('.result-link').each((i, el) => {
      if (i >= 5) return;
      const title = $(el).text().trim();
      let url = $(el).attr('href') || '#';

      if (url.startsWith('//')) url = 'https:' + url;

      const snippet = $(el).closest('tr').next().find('.result-snippet').text().trim();
      results.push(`Título: ${title}\nURL: ${url}\nResumo: ${snippet}\n---`);
    });

    return results.join('\n') || 'Nenhum resultado encontrado.';
  } catch (error) {
    scoutDiag.error('DocumentExtractor', 'Erro na busca DuckDuckGo', error);
    return null;
  }
}

/**
 * Verifica se o nome parece ser de empresa (PJ) em vez de pessoa física.
 * Usado para decidir se tentamos consultasocio.com (que só tem PF).
 */
export function isPessoaJuridica(name: string): boolean {
  return /\b(LTDA|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME|CIA|PARTICIPACOES|PARTICIPAÇÕES|AGROPECUARIA|AGROPECUÁRIA|COMERCIAL|ATACADISTA|INDUSTRIA|INDÚSTRIA|SERVICOS|SERVIÇOS|HOLDING|EMPRESA|CONSULTORIA|ASSESSORIA|TRANSPORTES|INCORPORADORA|EMPREENDIMENTOS)\b/i.test(
    name,
  );
}

/**
 * Monta a URL do consultasocio.com para buscar empresas de uma pessoa física.
 * O site usa o padrão /q/sa/{nome-minusculo-sem-acentos-com-hifens}
 */
export function buildConsultasocioUrl(nomeSocio: string): string {
  const slug = nomeSocio
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `https://www.consultasocio.com/q/sa/${slug}`;
}

/**
 * Busca direta no consultasocio.com — scraping de todas as empresas de uma pessoa física.
 * Retorna texto formatado compatível com splitSearchBlocks() do socio-search.
 * Lê até 3 páginas de resultados para capturar o inventário completo.
 */
export async function searchConsultasocioDirect(socioName: string): Promise<string | null> {
  const cheerio = await import('cheerio');
  const url = buildConsultasocioUrl(socioName);
  scoutDiag.info('DocumentExtractor', `consultasocio.com direto: ${url}`);

  try {
    const allBlocks: string[] = [];
    const maxPages = 15;

    // Page 1: sequential — valida existencia e estrutura do site
    const page1Url = url;
    const page1Response = await fetch(page1Url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!page1Response.ok) {
      scoutDiag.warn('DocumentExtractor', `consultasocio.com retornou ${page1Response.status}`, { url });
      return null;
    }

    const page1Html = await page1Response.text();
    const $ = cheerio.load(page1Html);
    const page1Text = $('body').text().replace(/\s+/g, ' ').trim();

    const cnpjPattern = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
    const page1Cnpjs = page1Text.match(cnpjPattern);

    if (!page1Cnpjs || page1Cnpjs.length === 0) {
      scoutDiag.warn('DocumentExtractor', 'consultasocio.com sem CNPJs na pagina 1', { url });
      return null;
    }

    allBlocks.push(`Título: consultasocio.com — ${socioName} (página 1)\nURL: ${page1Url}\nResumo: ${page1Text}\n---`);

    const hasNextPage = $('a')
      .toArray()
      .some(el => $(el).attr('href')?.includes('page=2'));
    if (!hasNextPage) {
      scoutDiag.info('DocumentExtractor', 'consultasocio.com: apenas 1 pagina');
      return allBlocks.join('\n');
    }

    // Pages 2+: paralelo — todas sao independentes (URL previsivel)
    const remainingPages: number[] = [];
    for (let p = 2; p <= maxPages; p++) remainingPages.push(p);

    const pageResults = await Promise.allSettled(
      remainingPages.map(async page => {
        const pageUrl = `${url}?page=${page}`;
        const resp = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) return null;
        const html = await resp.text();
        const $2 = cheerio.load(html);
        const text = $2('body').text().replace(/\s+/g, ' ').trim();
        const found = text.match(cnpjPattern);
        if (!found || found.length === 0) return null;
        return {
          page,
          pageUrl,
          text,
        };
      }),
    );

    for (const result of pageResults) {
      if (result.status === 'fulfilled' && result.value) {
        allBlocks.push(
          `Título: consultasocio.com — ${socioName} (página ${result.value.page})\nURL: ${result.value.pageUrl}\nResumo: ${result.value.text}\n---`,
        );
      }
    }

    const result = allBlocks.join('\n');
    scoutDiag.info('DocumentExtractor', `consultasocio.com: ${allBlocks.length} páginas extraídas (paralelo)`);
    return result || null;
  } catch (error) {
    scoutDiag.warn('DocumentExtractor', 'consultasocio.com indisponivel', {
      socioName,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface CnpjAbertoCompanyResult {
  name: string;
  cnpj?: string;
  role?: string;
  registrationStatus?: string;
  sourceTitle: string;
  sourceUrl: string;
  snippet: string;
}

type CnpjAbertoApiRecord = Record<string, unknown>;

function readString(record: CnpjAbertoApiRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractCnpjAbertoRecords(data: unknown): CnpjAbertoApiRecord[] {
  if (Array.isArray(data))
    return data.filter((item): item is CnpjAbertoApiRecord => Boolean(item && typeof item === 'object'));
  if (!data || typeof data !== 'object') return [];
  const record = data as CnpjAbertoApiRecord;
  for (const key of ['empresas', 'data', 'results', 'companies']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is CnpjAbertoApiRecord => Boolean(item && typeof item === 'object'));
    }
  }
  return [];
}

/**
 * Busca empresas vinculadas a uma pessoa física via CNPJ Aberto API.
 * Endpoint: GET /api/socio/empresas?nome={name}&limit=50
 * Header: X-API-Key: CNPJABERTO_API_KEY
 */
export async function searchCnpjAbertoCompanies(socioName: string): Promise<CnpjAbertoCompanyResult[] | null> {
  const apiKey = process.env.CNPJABERTO_API_KEY;
  if (!apiKey) {
    scoutDiag.warn('DocumentExtractor', 'CNPJ Aberto: API key ausente no ambiente', {
      hasEnv: 'CNPJABERTO_API_KEY' in (process.env || {}),
      envKeys: Object.keys(process.env || {})
        .filter(k => k.includes('CNPJ') || k.includes('API'))
        .join(','),
    });
    return null;
  }

  scoutDiag.info('DocumentExtractor', `CNPJ Aberto — companies_by_owner: ${socioName}`);

  try {
    const response = await fetch(
      `https://cnpjaberto.com.br/api/socio/empresas?nome=${encodeURIComponent(socioName)}&limit=100`,
      {
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'ScoutAgro/1.0',
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      scoutDiag.warn('DocumentExtractor', `CNPJ Aberto API error: ${response.status}`, {
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
      });
      return null;
    }

    const data = (await response.json()) as unknown;
    const companies = extractCnpjAbertoRecords(data);

    if (!Array.isArray(companies) || companies.length === 0) {
      scoutDiag.warn('DocumentExtractor', 'CNPJ Aberto: sem empresas encontradas');
      return null;
    }

    const results: CnpjAbertoCompanyResult[] = [];
    for (const company of companies) {
      const name = readString(company, ['razao_social', 'razão_social', 'nome', 'name']);
      const cnpjRaw = readString(company, ['cnpj', 'cnpj_formatado']);
      const cnpj = normalizeCnpj(cnpjRaw);
      const role = readString(company, ['qualificacao', 'qualificacao_socio', 'qualificação', 'cargo', 'role']);
      const registrationStatus = readString(company, [
        'situacao',
        'situação',
        'situacao_cadastral',
        'situação_cadastral',
        'descricao_situacao_cadastral',
        'status',
        'status_receita',
      ]);
      if (!name && !cnpj) continue;

      const sourceTitle = `CNPJ Aberto — ${name || `CNPJ ${cnpjRaw}`}${cnpjRaw ? ` (CNPJ ${cnpjRaw})` : ''}`;
      const sourceUrl = cnpj
        ? `https://cnpjaberto.com.br/${cnpj}`
        : `https://cnpjaberto.com.br/api/socio/empresas?nome=${encodeURIComponent(socioName)}`;
      const summaryParts = [name];
      if (cnpjRaw) summaryParts.push(`CNPJ ${cnpjRaw}`);
      if (role) summaryParts.push(role);
      if (registrationStatus) summaryParts.push(`Situação ${registrationStatus}`);
      results.push({
        name: name || `Empresa CNPJ ${cnpjRaw}`,
        cnpj: cnpj || cnpjRaw || undefined,
        role: role || undefined,
        registrationStatus: registrationStatus || undefined,
        sourceTitle,
        sourceUrl,
        snippet: summaryParts.filter(Boolean).join(' — '),
      });
    }

    if (results.length === 0) return null;
    scoutDiag.info('DocumentExtractor', `CNPJ Aberto: ${results.length} empresas encontradas`);
    if (results.length >= 190) {
      scoutDiag.warn(
        'DocumentExtractor',
        'CNPJ Aberto retornou proximo ao limite de 200; pode haver empresas nao listadas',
        {
          socioName,
          count: results.length,
          limit: 200,
        },
      );
    }
    return results;
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    scoutDiag.warn('DocumentExtractor', 'CNPJ Aberto indisponível', {
      socioName,
      message: error instanceof Error ? error.message : String(error),
      isTimeout,
      isAbort: error instanceof DOMException && error.name === 'AbortError',
    });
    return null;
  }
}

/**
 * Compatibilidade com o pipeline textual legado.
 */
export async function searchCnpjAberto(socioName: string): Promise<string | null> {
  const companies = await searchCnpjAbertoCompanies(socioName);
  if (!companies?.length) return null;
  return companies
    .map(company =>
      [`Título: ${company.sourceTitle}`, `URL: ${company.sourceUrl}`, `Resumo: ${company.snippet}`, '---'].join('\n'),
    )
    .join('\n');
}

/**
 * Função Unificada para Extração de Documentos ou Web.
 */
export async function universalExtract(params: {
  url?: string;
  base64Content?: string;
  mimeType?: string;
  limit?: number;
}): Promise<UniversalExtractResult> {
  const { url, base64Content, mimeType, limit = 15000 } = params;
  let text = '';

  try {
    if (url) {
      if (!isValidPublicUrl(url)) {
        throw new Error('URL restrita ou inválida por segurança.');
      }

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) throw new Error(`Falha no download da URL (${response.status})`);

      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('application/pdf')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        text = await extractPdf(buffer);
      } else if (contentType.includes('officedocument.wordprocessingml.document')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        text = await extractDocx(buffer);
      } else {
        const html = await response.text();
        text = await extractHtml(html, limit);
      }
    } else if (base64Content && mimeType) {
      const buffer = Buffer.from(base64Content, 'base64');

      if (mimeType === 'application/pdf') {
        text = await extractPdf(buffer);
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        text = await extractDocx(buffer);
      } else if (mimeType === 'text/html') {
        text = await extractHtml(buffer.toString('utf-8'), limit);
      } else if (mimeType === 'text/plain') {
        text = buffer.toString('utf-8');
      } else {
        throw new Error('Mime-type não suportado para extração.');
      }
    }

    const processedText = stripNullCharacters(text).replace(/\s+/g, ' ').trim().slice(0, limit);

    return {
      text: processedText,
      length: processedText.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    scoutDiag.error('DocumentExtractor', 'Falha na extração universal', { error: message });
    return { text: '', length: 0, error: message };
  }
}
