import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import * as cheerio from 'cheerio';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedViaLiteLLM, EMBEDDINGS_MODEL_ID } from '../utils/llm/embeddings.ts';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// SSRF Guard (P0 de segurança)
// ---------------------------------------------------------------------------

const ALLOWED_DOMAINS = [/^https:\/\/documentacao\.senior\.com\.br\//];

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!ALLOWED_DOMAINS.some(pattern => pattern.test(url))) return false;

    // Block private/reserved IPs
    const hostname = parsed.hostname.toLowerCase();

    // localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]')
      return false;

    // 169.254.x.x (link-local)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;

    // 10.x.x.x (private A)
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;

    // 172.16-31.x.x (private B)
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;

    // 192.168.x.x (private C)
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PINECONE_API_KEY = process.env.PINECONE_DOCS_KEY || process.env.VITE_PINECONE_KEY || process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_DOCS_INDEX || 'scout-arsenal';
const NAMESPACE = 'senior-erp-docs';
const BATCH_SIZE = 50;
const FETCH_TIMEOUT_MS = 15_000;
const RATE_LIMIT_DELAY_MS = 500;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 220;
const MAX_CONCURRENCY = 3;
const USER_AGENT = 'SeniorScout360-Crawler/1.0';

if (!PINECONE_API_KEY) {
  console.error(
    'ERRO: Variáveis de ambiente ausentes. Verifique PINECONE_API_KEY (ou PINECONE_DOCS_KEY) e as vars LiteLLM (LITELLM_BASE_URL/LITELLM_API_KEY).',
  );
  process.exit(1);
}
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX_NAME);

// ---------------------------------------------------------------------------
// Text extraction from HTML
// ---------------------------------------------------------------------------

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Try known content containers first
  const contentSelectors = ['.content', 'article', 'main', '#content', '.documentation', '.markdown-body'];
  let container: any = $('body');

  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length > 0) {
      container = el.first();
      break;
    }
  }

  // Remove unwanted elements
  container.find('script, style, nav, header, footer, iframe, noscript, svg, .menu, .sidebar').remove();

  const text = container
    .find('h1, h2, h3, h4, h5, h6, p, li, td, th, dt, dd, blockquote, pre, code, div.text, span.text')
    .map(function () {
      const $el = $(this);
      const tag = this.tagName?.toLowerCase() || '';
      const inner = $el.text().trim();
      if (!inner) return '';
      if (/^h[1-6]$/.test(tag)) return '\n\n' + inner + '\n';
      if (tag === 'li') return '\n- ' + inner;
      if (tag === 'dt') return '\n' + inner + ': ';
      if (tag === 'dd') return inner;
      return '\n' + inner;
    })
    .get()
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Fallback: if content selectors yielded nothing useful, grab all visible text
  if (text.length < 50) {
    return $(container).text().replace(/\s+/g, ' ').trim();
  }

  return text;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Fetch with retry + timeout
// ---------------------------------------------------------------------------

interface FetchResult {
  html: string;
  title: string;
}

async function fetchWithTimeout(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const title = extractTitleFromHtml(html);
    return { html, title: title || new URL(url).pathname.split('/').pop() || 'Sem título' };
  } finally {
    clearTimeout(timer);
  }
}

function extractTitleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Pinecone helpers
// ---------------------------------------------------------------------------

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const result = await embedViaLiteLLM(texts, { model: EMBEDDINGS_MODEL_ID });
  return result.vectors;
}

// ---------------------------------------------------------------------------
// CsvRow (compatible with ingestErpDocs.ts)
// ---------------------------------------------------------------------------

interface CsvRow {
  Categoria?: string;
  Título?: string;
  'TÃ­tulo'?: string;
  Titulo?: string;
  Caminho?: string;
  'URL Completa'?: string;
  URL?: string;
  Breadcrumb?: string;
  Módulo?: string;
  'MÃ³dulo'?: string;
  Produto?: string;
  Portal?: string;
  Source?: string;
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Rate-limited queue
// ---------------------------------------------------------------------------

interface CrawlTask {
  url: string;
  modulo: string;
  originalTitle: string;
}

interface CrawlResult {
  task: CrawlTask;
  chunkCount: number;
  error?: string;
}

async function runTaskQueue(tasks: CrawlTask[], concurrency: number): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++;
      const task = tasks[taskIndex];

      // Rate-limit delay between starts
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));

      if (!isValidUrl(task.url)) {
        results.push({ task, chunkCount: 0, error: 'URL inválida ou bloqueada (SSRF)' });
        continue;
      }

      try {
        const { html, title } = await fetchWithTimeout(task.url);
        const extracted = extractTextFromHtml(html);
        if (extracted.length < 20) {
          results.push({ task, chunkCount: 0, error: 'Conteúdo extraído insuficiente' });
          continue;
        }
        const chunks = chunkText(extracted);
        results.push({ task: { ...task, originalTitle: title || task.originalTitle }, chunkCount: chunks.length });

        // Process chunks in batches
        const records = chunks.map((chunkText, chunkIdx) => ({
          id: `senior-doc-${crypto.createHash('sha1').update(task.url).digest('hex').slice(0, 20)}-chunk-${chunkIdx}`,
          text: chunkText,
          metadata: {
            categoria: task.modulo,
            titulo: task.originalTitle,
            url: task.url,
            crawl_status: 'success',
            crawl_date: new Date().toISOString(),
            source: 'crawler',
          },
        }));

        const pineconeRecords = await embedAndUpsert(records);
        console.log(`  -> ${pineconeRecords} chunks indexados de "${title || task.originalTitle}"`);
      } catch (err: any) {
        const reason = err.name === 'AbortError' ? 'Timeout (15s)' : err.message || 'Erro desconhecido';
        results.push({ task, chunkCount: 0, error: reason });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

async function embedAndUpsert(
  records: Array<{ id: string; text: string; metadata: Record<string, string | boolean | number> }>,
): Promise<number> {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const texts = batch.map(r => r.text);
    const vectors = await generateEmbeddingsBatch(texts);

    const pineconeRecords = batch.map((r, idx) => ({
      id: r.id,
      values: vectors[idx],
      metadata: r.metadata,
    }));

    try {
      await index.namespace(NAMESPACE).upsert(pineconeRecords);
    } catch (err: any) {
      console.error(`  Erro ao enviar lote: ${err.message}. Retentando...`);
      await new Promise(r => setTimeout(r, 5000));
      const retryVectors = await generateEmbeddingsBatch(texts);
      const retryRecords = batch.map((r, idx) => ({
        id: r.id,
        values: retryVectors[idx],
        metadata: r.metadata,
      }));
      await index.namespace(NAMESPACE).upsert(retryRecords);
    }
  }
  return records.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function crawlAndIngest(): Promise<void> {
  const fileName = process.argv[2] || 'senior_erp_links.csv';
  const csvPath = path.join(__dirname, '../Links documentação', fileName);

  if (!fs.existsSync(csvPath)) {
    console.error(`ERRO: Arquivo CSV não encontrado: ${csvPath}`);
    console.error('Uso: npx tsx scripts/crawlAndIngestSeniorDocs.ts [caminho-para-csv]');
    process.exit(1);
  }

  console.log(`\n🔍 Lendo CSV: ${csvPath}`);

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );

  const tasks: CrawlTask[] = [];
  for await (const row of parser) {
    const r = row as CsvRow;
    const urlStr = r['URL Completa'] || r['URL'] || '';
    if (!urlStr || urlStr.trim() === '') continue;

    const originalTitle = r['Título'] || r['TÃ­tulo'] || r['Titulo'] || '';
    const modulo = r.Módulo || r['MÃ³dulo'] || r.Categoria || r.Produto || '';
    tasks.push({ url: urlStr.trim(), modulo, originalTitle });
  }

  console.log(`📄 Total de URLs no CSV: ${tasks.length}`);
  console.log(`🚀 Iniciando crawl com ${MAX_CONCURRENCY} workers concorrentes...\n`);

  const results = await runTaskQueue(tasks, MAX_CONCURRENCY);

  // ---- Relatório final ----
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const totalChunks = succeeded.reduce((sum, r) => sum + r.chunkCount, 0);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RELATÓRIO FINAL — CRAWL & INGEST');
  console.log('='.repeat(60));
  console.log(`✅ ${succeeded.length} páginas indexadas com sucesso`);
  console.log(`❌ ${failed.length} páginas falharam`);
  console.log(`📦 ${totalChunks} chunks totais`);
  console.log(`🏷️  Namespace: ${NAMESPACE}`);
  console.log(`🗂️  Índice: ${PINECONE_INDEX_NAME}`);
  console.log();

  if (failed.length > 0) {
    console.log('⚠️  URLs que falharam:');
    for (const f of failed) {
      console.log(`  - ${f.task.url}`);
      console.log(`    Motivo: ${f.error}`);
    }
  }
}

crawlAndIngest().catch(err => {
  console.error('\n💥 Erro fatal:', err?.message || err);
  process.exit(1);
});
