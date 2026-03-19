import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// ===================================================================
// CONFIGURAÇÃO
// ===================================================================

export const config = { runtime: 'nodejs' };
export const maxDuration = 120;

const DEFAULT_MODEL = 'gemini-2.5-flash';
const FETCH_TIMEOUT_MS = 12_000;
const GEMINI_TIMEOUT_MS = 25_000;

const VALID_CATEGORIES = [
  'concorrentes', 'agro_tech', 'regulatorio', 'mercado', 'rh_trabalho', 'ma_expansao',
] as const;

const RequestSchema = z.object({
  categories: z.array(z.enum(VALID_CATEGORIES)).min(1).max(6),
  estados: z.array(z.string().length(2)).max(27).default([]),
});

// ===================================================================
// GOOGLE NEWS RSS QUERIES POR CATEGORIA
// ===================================================================

const CATEGORY_QUERIES: Record<string, string[]> = {
  concorrentes: [
    '"TOTVS" agro OR "SAP" agronegócio OR "Sankhya" OR "SIAGRI" OR "Senior Sistemas" software',
    '"ERP agro" OR "software gestão rural" lançamento OR parceria OR aquisição',
  ],
  agro_tech: [
    '"agricultura de precisão" OR "agtech" OR "drone agro" OR "IoT campo" OR "inteligência artificial agro"',
    '"conectividade rural" OR "automação agrícola" OR "sensoriamento remoto" safra',
  ],
  regulatorio: [
    '"Plano Safra" OR "IBAMA" regulamentação OR "Código Florestal" OR "rastreabilidade" agro',
    '"ESG agronegócio" OR "crédito carbono" rural OR "MAPA" regulação',
  ],
  mercado: [
    '"soja" preço cotação safra 2025 OR 2026',
    '"milho" OR "algodão" OR "café" commodities agro Brasil exportação',
  ],
  rh_trabalho: [
    '"NR-31" OR "eSocial rural" trabalhista agro OR "mão de obra" campo',
    '"direito trabalhista rural" OR "sindicato rural" OR "SST agro"',
  ],
  ma_expansao: [
    '"fusão" OR "aquisição" agronegócio OR "IPO agro" OR "investimento" terras',
    '"cooperativa" expansão agro OR "compra fazenda" OR "fundo investimento" agrícola',
  ],
};

// ===================================================================
// RSS FEEDS FIXOS POR CATEGORIA
// ===================================================================

interface FeedSource {
  url: string;
  name: string;
  categories: string[];
}

const RSS_FEEDS: FeedSource[] = [
  { url: 'https://www.canalrural.com.br/feed/', name: 'Canal Rural', categories: ['agro_tech', 'mercado', 'ma_expansao'] },
  { url: 'https://www.noticiasagricolas.com.br/rss/ultimas-noticias.xml', name: 'Notícias Agrícolas', categories: ['mercado', 'concorrentes'] },
  { url: 'https://www.agrolink.com.br/rss/', name: 'Agrolink', categories: ['agro_tech', 'regulatorio', 'mercado'] },
  { url: 'https://tiinside.com.br/feed/', name: 'TI Inside', categories: ['concorrentes', 'agro_tech'] },
  { url: 'https://www.infomoney.com.br/feed/', name: 'InfoMoney', categories: ['mercado', 'ma_expansao'] },
];

// ===================================================================
// RSS PARSER (manual — sem dependência)
// ===================================================================

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  sourceName: string;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '') : '';
}

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractTag(block, 'guid');
    const description = extractTag(block, 'description')
      .replace(/<[^>]*>/g, '') // strip HTML
      .slice(0, 300);
    const pubDate = extractTag(block, 'pubDate');

    if (title && title.length > 5) {
      items.push({ title, link, description, pubDate, sourceName });
    }
  }
  return items.slice(0, 10); // max 10 per feed
}

// ===================================================================
// FETCH HELPERS
// ===================================================================

async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScoutRadar/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(handle);
  }
}

async function fetchGoogleNewsRSS(queries: string[]): Promise<RSSItem[]> {
  const allItems: RSSItem[] = [];
  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://news.google.com/rss/search?q=${encoded}+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      const xml = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      const items = parseRSSXml(xml, 'Google News');
      allItems.push(...items);
    } catch (err) {
      console.warn(`[RADAR] Google News RSS failed for query: ${query}`, err instanceof Error ? err.message : '');
    }
  }
  return allItems;
}

async function fetchFixedRSSFeeds(category: string): Promise<RSSItem[]> {
  const relevantFeeds = RSS_FEEDS.filter(f => f.categories.includes(category));
  const allItems: RSSItem[] = [];
  
  await Promise.allSettled(
    relevantFeeds.map(async (feed) => {
      try {
        const xml = await fetchWithTimeout(feed.url, FETCH_TIMEOUT_MS);
        const items = parseRSSXml(xml, feed.name);
        allItems.push(...items);
      } catch (err) {
        console.warn(`[RADAR] RSS feed failed: ${feed.name}`, err instanceof Error ? err.message : '');
      }
    }),
  );
  
  return allItems;
}

// ===================================================================
// GEMINI SUMMARIZER (não usa googleSearch — só classifica)
// ===================================================================

async function summarizeWithGemini(
  ai: GoogleGenAI,
  items: RSSItem[],
  category: string,
  estados: string[],
): Promise<any[]> {
  if (items.length === 0) return [];

  // Deduplicate by title similarity
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const key = item.title.toLowerCase().trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Limit to top 15 to save tokens
  const batch = unique.slice(0, 15);

  const articleList = batch.map((item, i) =>
    `[${i + 1}] TÍTULO: ${item.title}\nDESCRIÇÃO: ${item.description}\nFONTE: ${item.sourceName}\nURL: ${item.link}\nDATA: ${item.pubDate || 'N/D'}`
  ).join('\n\n');

  const estadoCtx = estados.length > 0
    ? `\nFOCO REGIONAL: Priorize artigos relevantes para: ${estados.join(', ')}.`
    : '';

  const prompt = `Você é um analista de inteligência de mercado agro.
Analise os artigos abaixo e selecione os 5 MAIS RELEVANTES para a categoria "${category}" do agronegócio brasileiro.
${estadoCtx}

Para cada artigo selecionado, retorne EXATAMENTE este bloco:
---ALERTA---
TITULO: [título limpo e conciso]
RESUMO: [resumo de impacto em 2 frases]
URL: [URL original do artigo]
FONTE: [nome da fonte]
RELEVANCIA: [alta, media, ou baixa]
DATA: [YYYY-MM-DD]
ESTADO: [Sigla UF se mencionado, ou none]
---FIM---

Se nenhum artigo for relevante para a categoria, retorne apenas: NENHUM_RESULTADO

ARTIGOS PARA ANÁLISE:
${articleList}`;

  try {
    const chat = ai.chats.create({
      model: DEFAULT_MODEL,
      config: {
        temperature: 0.1,
        maxOutputTokens: 3000,
        // NO googleSearch tool — just analyzing provided text
      },
    });

    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let text: string;
    try {
      const response = await chat.sendMessage({ message: prompt });
      text = response.text || '';
    } finally {
      clearTimeout(handle);
    }

    console.log(`[RADAR] Gemini summary for ${category} (200 chars): ${text.slice(0, 200)}`);
    return parseAlerts(text, category, new Date().toISOString());
  } catch (err) {
    console.error(`[RADAR] Gemini summarize failed for ${category}:`, err instanceof Error ? err.message : '');
    // Fallback: return raw items without AI classification
    return batch.slice(0, 5).map(item => ({
      id: hashId(item.title, item.link),
      title: item.title.slice(0, 300),
      summary: item.description.slice(0, 500) || 'Sem resumo disponível',
      sourceUrl: item.link || '#',
      sourceName: item.sourceName || 'Fonte desconhecida',
      category,
      relevance: 'media',
      publishedAt: parseDate(item.pubDate),
      scannedAt: new Date().toISOString(),
      estado: undefined,
      read: false,
    }));
  }
}

// ===================================================================
// PARSE HELPERS
// ===================================================================

function hashId(title: string, url: string): string {
  const raw = `${(title || '').toLowerCase().trim()}|${(url || '').toLowerCase().trim()}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h) + raw.charCodeAt(i);
    h |= 0;
  }
  return `radar_${Math.abs(h).toString(36)}`;
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function parseAlerts(text: string, category: string, scannedAt: string): any[] {
  if (text.includes('NENHUM_RESULTADO')) return [];

  const alerts: any[] = [];
  const blocks = text.split('---ALERTA---');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('---FIM---')[0];
    if (!block) continue;

    const getField = (label: string) => {
      const regex = new RegExp(`${label}:\\s*(.*)`);
      const match = block.match(regex);
      return match ? match[1].trim().replace(/^\[|\]$/g, '') : '';
    };

    const title = getField('TITULO');
    const summary = getField('RESUMO');
    const sourceUrl = getField('URL');
    const sourceName = getField('FONTE');
    const relevanceRaw = getField('RELEVANCIA').toLowerCase() || 'media';
    const publishedAt = getField('DATA');
    const estadoRaw = getField('ESTADO');

    if (!title || title.length < 5) continue;

    alerts.push({
      id: hashId(title, sourceUrl),
      title: title.slice(0, 300),
      summary: summary.slice(0, 500),
      sourceUrl: sourceUrl.slice(0, 1000) || '#',
      sourceName: sourceName.slice(0, 100) || 'Fonte desconhecida',
      category,
      relevance: ['alta', 'media', 'baixa'].includes(relevanceRaw) ? relevanceRaw : 'media',
      publishedAt: publishedAt && publishedAt.length === 10 ? publishedAt : scannedAt.split('T')[0],
      scannedAt,
      estado: estadoRaw && estadoRaw.length === 2 && estadoRaw !== 'no' ? estadoRaw : undefined,
      read: false,
    });
  }

  return alerts.slice(0, 5);
}

// ===================================================================
// HANDLER
// ===================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    const body = req.method === 'GET'
      ? { categories: [...VALID_CATEGORIES], estados: [] }
      : req.body;

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { categories, estados } = parsed.data;
    const ai = new GoogleGenAI({ apiKey });
    const scannedAt = new Date().toISOString();

    // Fase 1: Buscar RSS em PARALELO (Google News + feeds fixos)
    const results = await Promise.allSettled(
      categories.map(async (category) => {
        const queries = CATEGORY_QUERIES[category] || [];

        // Buscar de ambas as fontes em paralelo
        const [googleNewsItems, fixedFeedItems] = await Promise.all([
          fetchGoogleNewsRSS(queries),
          fetchFixedRSSFeeds(category),
        ]);

        const allItems = [...googleNewsItems, ...fixedFeedItems];
        console.log(`[RADAR] ${category}: ${googleNewsItems.length} Google News + ${fixedFeedItems.length} RSS = ${allItems.length} total items`);

        if (allItems.length === 0) {
          console.warn(`[RADAR] No RSS items found for ${category}`);
          return [];
        }

        // Fase 2: Gemini resume e classifica (SEM googleSearch)
        return summarizeWithGemini(ai, allItems, category, estados);
      }),
    );

    const allAlerts: unknown[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allAlerts.push(...result.value);
      } else {
        console.error(`[RADAR] Erro na categoria ${categories[i]}:`, result.reason);
      }
    });

    return res.status(200).json({ alerts: allAlerts, scannedAt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RADAR] Error:', message);
    return res.status(500).json({ error: 'Radar scan failed', detail: message });
  }
}
