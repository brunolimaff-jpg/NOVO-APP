import { MODEL_IDS } from '../config/models';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

type PdfDoc = {
  filePath: string;
  title: string;
  content: string;
  ocrUsed: boolean;
  extraction: 'native' | 'gemini_ocr' | 'failed';
};

type ChunkRecord = {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY;
const PINECONE_API_KEY =
  process.env.PINECONE_DOCS_KEY || process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_KEY;
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
const GEMINI_OCR_MAX_BYTES = 18 * 1024 * 1024;
const GEMINI_OCR_MODEL = process.env.GEMINI_OCR_MODEL || MODEL_IDS.router;

if (!GEMINI_API_KEY || !PINECONE_API_KEY) {
  console.error('ERRO: faltam variaveis GEMINI_API_KEY e/ou PINECONE_DOCS_KEY/PINECONE_API_KEY.');
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

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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

async function extractPdfWithGeminiOcr(buffer: Buffer, title: string): Promise<string> {
  const base64 = buffer.toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_OCR_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const prompt =
    `Extraia o texto deste PDF com foco em legibilidade e fidelidade. ` +
    `Mantenha estrutura em secoes/listas quando possivel. Nao resuma. ` +
    `Documento: ${title}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Gemini OCR HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
  return normalizeText(text);
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
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: texts,
    config: { taskType: 'RETRIEVAL_DOCUMENT' },
  });
  return (result.embeddings || []).map((e) => e.values || []);
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

  if (buffer.byteLength > GEMINI_OCR_MAX_BYTES) {
    return { filePath, title, content: '', ocrUsed: false, extraction: 'failed' };
  }

  try {
    const ocrText = await extractPdfWithGeminiOcr(buffer, title);
    if (ocrText.length >= NATIVE_MIN_CHARS) {
      return { filePath, title, content: ocrText, ocrUsed: true, extraction: 'gemini_ocr' };
    }
  } catch {
    // Sem texto util.
  }

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
  let ocrCount = 0;
  let failedCount = 0;

  for (const [i, pdf] of pdfs.entries()) {
    const doc = await extractDoc(pdf);
    docs.push(doc);
    if (doc.extraction === 'native') nativeCount += 1;
    else if (doc.extraction === 'gemini_ocr') ocrCount += 1;
    else failedCount += 1;
    console.log(
      `[${i + 1}/${pdfs.length}] ${path.basename(pdf)} -> ${doc.extraction} (${doc.content.length} chars)`,
    );
  }

  const allRecords = docs.flatMap((doc) => docToChunkRecords(doc, CATEGORY));
  if (!allRecords.length) {
    console.log('[ingestPdfDocs] Nenhum chunk gerado. Nada para indexar.');
    return;
  }
  console.log(`[ingestPdfDocs] Chunks totais: ${allRecords.length}`);

  let inserted = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((r) => r.text));
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
  console.log(`Extraidos com OCR Gemini: ${ocrCount}`);
  console.log(`Falhas sem texto: ${failedCount}`);
  console.log(`Chunks indexados: ${inserted}`);
  console.log(`Indice: ${PINECONE_INDEX_NAME}`);
  console.log(`Namespace: ${PINECONE_NAMESPACE}`);
}

run().catch((err) => {
  console.error('[ingestPdfDocs] Falha geral:', err?.message || err);
  process.exit(1);
});
