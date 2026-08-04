import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedViaLiteLLM, EMBEDDINGS_MODEL_ID } from '../utils/llm/embeddings.ts';
import dotenv from 'dotenv';

dotenv.config();

type PdfDoc = {
  filePath: string;
  title: string;
  content: string;
  ocrUsed: boolean;
  extraction: 'native' | 'failed';
};

type ChunkRecord = {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
};

const PINECONE_API_KEY = process.env.PINECONE_DOCS_KEY || process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_KEY;
const DEFAULT_INDEX = 'scout-arsenal';
const DEFAULT_NAMESPACE = 'competitor-pdfs';
const INDEX_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const SECRET_PREFIX_RE = /^pcsk_/i;

const INPUT_DIR = process.argv[2] || path.join(process.cwd(), 'alvos2');
const CATEGORY = process.argv[3] || 'Concorrente';
const BATCH_SIZE = Number(process.argv[4] || 20);
const CHUNK_SIZE = Number(process.argv[5] || 1800);
const CHUNK_OVERLAP = Number(process.argv[6] || 220);
const INDEX_OVERRIDE = process.argv[7];
const NAMESPACE_OVERRIDE = process.argv[8];
const NATIVE_MIN_CHARS = 350;

// OCR de PDF descontinuado: o gateway LiteLLM não expõe modelo de visão.
// A migração futura deve integrar um provedor OCR dedicado (legado
// GEMINI_OCR_MODEL documentado apenas no git history).

if (!PINECONE_API_KEY) {
  console.error('ERRO: faltam variaveis PINECONE_DOCS_KEY/PINECONE_API_KEY e as vars LiteLLM (LITELLM_BASE_URL/LITELLM_API_KEY).');
  process.exit(1);
}

function resolveIndexName(candidate: string | undefined): string {
  const normalized = (candidate || '').trim();
  if (!normalized) return DEFAULT_INDEX;
  if (SECRET_PREFIX_RE.test(normalized)) return DEFAULT_INDEX;
  if (!INDEX_NAME_RE.test(normalized)) return DEFAULT_INDEX;
  return normalized;
}

const PINECONE_INDEX_NAME = resolveIndexName(
  INDEX_OVERRIDE || process.env.PINECONE_DOCS_INDEX || process.env.PINECONE_INDEX,
);
const PINECONE_NAMESPACE = (NAMESPACE_OVERRIDE || process.env.PINECONE_DOCS_NAMESPACE || DEFAULT_NAMESPACE).trim();

const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pinecone.index(PINECONE_INDEX_NAME);

async function listPdfsRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith('.pdf')) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}

function normalizeText(input: string): string {
  return input.split('\u0000').join(' ').replace(/\s+/g, ' ').trim();
}

async function extractPdfNative(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return normalizeText(parsed.text || '');
  } finally {
    await parser.destroy();
  }
}

export async function extractPdfOcrFailClosed(_buffer: Buffer, _title: string): Promise<string> {
  // Fail-closed: OCR via modelo legado foi removido (LiteLLM-only) e o gateway
  // não expõe modelo de visão. Nunca mais chama provedor legado.
  throw new Error(
    'OCR_PROVIDER_UNAVAILABLE: OCR de PDF descontinuado — gateway LiteLLM sem modelo de visão. ' +
      'Integrar provedor OCR dedicado antes de reativar esta rota.',
  );
}

function makeChunks(text: string, chunkSize: number, overlap: number): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const result = await embedViaLiteLLM(texts, { model: EMBEDDINGS_MODEL_ID });
  return result.vectors;
}

function recordId(filePath: string, chunkIdx: number): string {
  const hash = createHash('sha1').update(`${filePath}::${chunkIdx}`).digest('hex').slice(0, 20);
  return `pdf-doc-${hash}-${chunkIdx}`;
}

async function extractDoc(filePath: string): Promise<PdfDoc> {
  const title = path.basename(filePath, '.pdf');
  const buffer = await fs.readFile(filePath);

  try {
    const nativeText = await extractPdfNative(buffer);
    if (nativeText.length >= NATIVE_MIN_CHARS) {
      return { filePath, title, content: nativeText, ocrUsed: false, extraction: 'native' };
    }
  } catch {
    // Continua para fallback OCR.
  }

  // OCR descontinuado (fail-closed): PDF sem extração nativa é registrado
  // como falha explícita — nunca usa modelo legado.
  return { filePath, title, content: '', ocrUsed: false, extraction: 'failed' };
}

function docToChunkRecords(doc: PdfDoc, category: string): ChunkRecord[] {
  const chunks = makeChunks(doc.content, CHUNK_SIZE, CHUNK_OVERLAP);
  const totalChunks = chunks.length;
  return chunks.map((chunk, idx) => ({
    id: recordId(doc.filePath, idx),
    text: `Doc concorrente | Titulo: ${doc.title} | Arquivo: ${path.basename(doc.filePath)} | Conteudo: ${chunk}`,
    metadata: {
      categoria: category,
      titulo: doc.title,
      source: 'pdf-folder',
      file_path: doc.filePath.replace(/\\/g, '/'),
      file_name: path.basename(doc.filePath),
      chunk_index: idx,
      chunk_total: totalChunks,
      ocr_used: doc.ocrUsed,
      extraction: doc.extraction,
      kind: 'competitor-pdf',
    },
  }));
}

async function run(): Promise<void> {
  console.log(`\n[ingestPdfDocs] Pasta alvo: ${INPUT_DIR}`);
  const pdfs = await listPdfsRecursive(INPUT_DIR);
  if (!pdfs.length) {
    console.log('[ingestPdfDocs] Nenhum PDF encontrado.');
    return;
  }
  console.log(`[ingestPdfDocs] PDFs encontrados: ${pdfs.length}`);

  const docs: PdfDoc[] = [];
  let nativeCount = 0;
  let failedCount = 0;

  for (const [i, pdf] of pdfs.entries()) {
    const doc = await extractDoc(pdf);
    docs.push(doc);
    if (doc.extraction === 'native') nativeCount += 1;
    else failedCount += 1;
    console.log(`[${i + 1}/${pdfs.length}] ${path.basename(pdf)} -> ${doc.extraction} (${doc.content.length} chars)`);
  }

  const allRecords = docs.flatMap(doc => docToChunkRecords(doc, CATEGORY));
  if (!allRecords.length) {
    console.log('[ingestPdfDocs] Nenhum chunk gerado. Nada para indexar.');
    return;
  }
  console.log(`[ingestPdfDocs] Chunks totais: ${allRecords.length}`);

  let inserted = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map(r => r.text));
    const pineconeRecords = batch.map((r, idx) => ({
      id: r.id,
      values: vectors[idx],
      metadata: r.metadata,
    }));
    await index.namespace(PINECONE_NAMESPACE).upsert(pineconeRecords);
    inserted += pineconeRecords.length;
    console.log(`[ingestPdfDocs] Upsert: ${inserted}/${allRecords.length}`);
  }

  console.log('\n===== RESUMO =====');
  console.log(`PDFs: ${pdfs.length}`);
  console.log(`Extraidos nativamente: ${nativeCount}`);
  console.log(`Extraidos com OCR: 0 (OCR descontinuado — fail-closed)`);
  console.log(`Falhas sem texto: ${failedCount}`);
  console.log(`Chunks indexados: ${inserted}`);
  console.log(`Indice: ${PINECONE_INDEX_NAME}`);
  console.log(`Namespace: ${PINECONE_NAMESPACE}`);
}

// Auto-run apenas quando executado diretamente (node scripts/ingestPdfDocs.ts).
// Quando importado por testes, o módulo apenas expõe as funções.
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  run().catch(err => {
    console.error('[ingestPdfDocs] Falha geral:', err?.message || err);
    process.exit(1);
  });
}
