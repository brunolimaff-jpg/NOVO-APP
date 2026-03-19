import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// ===================================================================
// CONFIGURAÇÃO
// ===================================================================

export const config = { runtime: 'nodejs' };
export const maxDuration = 120;

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const SCAN_TIMEOUT_MS = 25_000; // 25s por categoria (execução paralela)

const VALID_CATEGORIES = [
  'concorrentes', 'agro_tech', 'regulatorio', 'mercado', 'rh_trabalho', 'ma_expansao',
] as const;

const RequestSchema = z.object({
  categories: z.array(z.enum(VALID_CATEGORIES)).min(1).max(6),
  estados: z.array(z.string().length(2)).max(27).default([]),
});

// ===================================================================
// NOMES DE CONCORRENTES (inline para serverless — sem import do frontend)
// ===================================================================

const CONCORRENTES_NOMES = [
  'SAP', 'TOTVS', 'Protheus', 'Sankhya', 'SIAGRI', 'CHB Sistemas',
  'Benner', 'LG Sistemas', 'Viasoft', 'Korp', 'Unisystem',
  'Senior Sistemas', 'GAtec', 'SimpleFarm', 'Aegro', 'Solinftec',
  'Aliare', 'Agrotitan', 'Oracle', 'Datasul',
];

// ===================================================================
// PROMPTS POR CATEGORIA
// ===================================================================

function buildPrompt(category: string, estados: string[]): string {
  const estadoCtx = estados.length > 0
    ? `\nFOCO REGIONAL: Priorize notícias para: ${estados.join(', ')}.`
    : '';

  const base = `Você é um Head de Inteligência de Mercado de agronegócio brasileiro.
USE A FERRAMENTA DE BUSCA NA WEB para pesquisar notícias reais dos últimos 7 dias. Não responda de memória.
${estadoCtx}

REGRAS:
- APENAS notícias reais com fontes verificáveis (URL pública).
- Não invente. Se não encontrar, retorne vazio.
- Portais prioritários: Valor Econômico, Canal Rural, Agrolink, TI Inside, InfoMoney, Reuters, Bloomberg, Globo Rural.
- Máximo 5 alertas.

FORMATO DA RESPOSTA:
Para cada alerta, retorne EXATAMENTE este bloco, substituindo os espaços:
---ALERTA---
TITULO: [título da notícia]
RESUMO: [resumo em 2 frases]
URL: [link completo]
FONTE: [nome do site]
RELEVANCIA: [alta, media, ou baixa]
DATA: [YYYY-MM-DD]
ESTADO: [Sigla da UF ou none]
---FIM---
`;

  const topics: Record<string, string> = {
    concorrentes: `\nCATEGORIA: MOVIMENTOS COMPETITIVOS ERP/SOFTWARE AGRO\nEmpresas: ${CONCORRENTES_NOMES.join(', ')}.\nFoco: lançamentos, investimentos IA, aquisições, parcerias, novos módulos agro, expansão regional, mudanças de liderança.`,
    agro_tech: `\nCATEGORIA: INOVAÇÃO AGTECH\nFoco: agricultura de precisão, drones, IoT campo, IA aplicada, sensoriamento remoto, automação, conectividade rural, startups agtech.`,
    regulatorio: `\nCATEGORIA: REGULATÓRIO & COMPLIANCE AGRO\nFoco: leis ambientais, IBAMA, SEMA, rastreabilidade, créditos carbono, ESG agro, certificações, Código Florestal, outorgas ANA, normas MAPA, Plano Safra.`,
    mercado: `\nCATEGORIA: MERCADO & COMMODITIES\nFoco: preços commodities (soja, milho, algodão, café), previsão safra, balança comercial, rotas logísticas, câmbio, cooperativas.`,
    rh_trabalho: `\nCATEGORIA: RH & TRABALHISTA AGRO\nFoco: reforma trabalhista rural, NR-31, eSocial rural, sindicatos, mão de obra, SST agro, gestão de terceiros.`,
    ma_expansao: `\nCATEGORIA: M&A & EXPANSÃO AGRO\nFoco: fusões, aquisições, compra de terras, consolidação cooperativas, investidores estrangeiros, IPOs agro, expansão grupos.`,
  };

  return base + (topics[category] || '');
}

// ===================================================================
// PARSE RESPOSTA DO GEMINI
// ===================================================================

interface RawAlert {
  title?: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
  relevance?: string;
  publishedAt?: string;
  estado?: string;
}

function hashId(title: string, url: string): string {
  const raw = `${(title || '').toLowerCase().trim()}|${(url || '').toLowerCase().trim()}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h) + raw.charCodeAt(i);
    h |= 0;
  }
  return `radar_${Math.abs(h).toString(36)}`;
}

function parseAlerts(text: string, category: string, scannedAt: string): any[] {
  const alerts: any[] = [];
  const blocks = text.split('---ALERTA---');
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('---FIM---')[0];
    if (!block) continue;
    
    // Extract fields
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
    
    const relevanceStr = ['alta', 'media', 'baixa'].includes(relevanceRaw) ? relevanceRaw : 'media';
    const estadoStr = estadoRaw && estadoRaw.length === 2 && estadoRaw !== 'no' ? estadoRaw : undefined;

    alerts.push({
      id: hashId(title, sourceUrl),
      title: title.slice(0, 300),
      summary: summary.slice(0, 500),
      sourceUrl: sourceUrl.slice(0, 1000) || '#',
      sourceName: sourceName.slice(0, 100) || 'Fonte desconhecida',
      category,
      relevance: relevanceStr,
      publishedAt: publishedAt && publishedAt.length === 10 ? publishedAt : scannedAt.split('T')[0],
      scannedAt,
      estado: estadoStr,
      read: false,
    });
  }
  
  if (alerts.length === 0) {
    console.warn(`[RADAR] No alerts parsed for ${category}. Raw (200 chars): ${text.slice(0, 200)}`);
  }
  return alerts.slice(0, 5);
}

// ===================================================================
// TIMEOUT HELPER
// ===================================================================

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

// ===================================================================
// HANDLER
// ===================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Suporta GET (cron) e POST (frontend)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    // Para GET (cron), usa todas as categorias
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

    // Processa categorias em PARALELO para caber no maxDuration de 120s
    const results = await Promise.allSettled(
      categories.map(async (category) => {
        const prompt = buildPrompt(category, estados);
        const chat = ai.chats.create({
          model: DEFAULT_MODEL,
          config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            tools: [{ googleSearch: {} }],
          },
        });

        const response = await withTimeout(
          chat.sendMessage({ message: prompt }),
          SCAN_TIMEOUT_MS,
          `radar-${category}`,
        );

        const text = response.text || '';
        console.log(`[RADAR] ${category} response (200 chars): ${text.slice(0, 200)}`);
        return parseAlerts(text, category, scannedAt);
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
