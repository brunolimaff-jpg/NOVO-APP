import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do .env na raiz
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.VITE_API_KEY || process.env.GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_DOCS_KEY || process.env.VITE_PINECONE_KEY || process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_DOCS_INDEX || 'scout-arsenal';

if (!GEMINI_API_KEY || !PINECONE_API_KEY) {
  console.error(
    'ERRO: Variáveis de ambiente ausentes. Verifique GEMINI_API_KEY e PINECONE_API_KEY (ou PINECONE_DOCS_KEY).',
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX_NAME);

// Namespace seguro e isolado para documentação
const NAMESPACE = 'senior-erp-docs';
const BATCH_SIZE = 50;
const failedBatches: string[] = [];

interface CsvRow {
  Categoria?: string;
  Título?: string;
  'TÃ­tulo'?: string;
  Titulo?: string;
  Caminho?: string;
  'URL Completa'?: string;
  URL?: string;
  Breadcrumb?: string;
  Source?: string;
  Módulo?: string;
  'MÃ³dulo'?: string;
  Produto?: string;
  Portal?: string;
  [key: string]: string | undefined; // Allow any other string keys
}

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: texts,
    config: { taskType: 'RETRIEVAL_DOCUMENT' },
  });

  if (!result.embeddings) return [];
  return result.embeddings.map(e => e.values || []);
}

async function ingest() {
  const fileName = process.argv[2] || 'senior_erp_links.csv';
  const csvPath = path.join(__dirname, '../Links documentação', fileName);
  console.log(`Lendo arquivo: ${csvPath}`);

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );

  let buffer: any[] = [];
  let successCount = 0;

  for await (const row of parser) {
    const r = row as CsvRow;

    // Só precisamos ingestão das URLs reais de documentação (Source chunk...)
    // A coluna Source no CSV tem 'chunk_0', 'chunkstart' ou vazio

    // Ignorar urls vazias
    const urlStr = r['URL Completa'] || r['URL'] || '';
    if (!urlStr || urlStr.trim() === '') continue;

    // Enriquecer texto para a IA encontrar
    const originalTitle = r['Título'] || r['TÃ­tulo'] || r['Titulo'] || '';
    const modulo = r.Módulo || r['MÃ³dulo'] || r.Categoria || r.Produto || '';
    const breadcrumbText = r.Breadcrumb
      ? ` | Caminho/Portal: ${r.Breadcrumb}`
      : r.Portal
        ? ` | Portal: ${r.Portal}`
        : '';
    const textToEmbed = `Manual Senior | Área: ${modulo} | Título: ${originalTitle}${breadcrumbText}`;

    const docId = `senior-doc-${crypto.createHash('sha1').update(urlStr).digest('hex').slice(0, 20)}`;
    buffer.push({
      id: docId,
      text: textToEmbed,
      metadata: {
        categoria: modulo,
        titulo: originalTitle,
        url: urlStr,
      },
    });

    if (buffer.length >= BATCH_SIZE) {
      await processBatch(buffer);
      successCount += buffer.length;
      console.log(`Progresso: ${successCount} links processados...`);
      buffer = [];
    }
  }

  // Remanescentes
  if (buffer.length > 0) {
    await processBatch(buffer);
    successCount += buffer.length;
  }

  console.log(
    `\n🎉 Finalizado! ${successCount} documentos do ERP Senior inseridos no Pinecone no namespace '${NAMESPACE}'.`,
  );

  if (failedBatches.length > 0) {
    console.log(
      `⚠️ ${failedBatches.length} lotes falharam: [${failedBatches.slice(0, 10).join(', ')}${failedBatches.length > 10 ? ', ...' : ''}]`,
    );
  }
}

async function processBatch(batch: any[]) {
  try {
    const texts = batch.map(item => item.text);
    const vectors = await generateEmbeddingsBatch(texts);

    const pineconeRecords = batch.map((item, i) => ({
      id: item.id,
      values: vectors[i],
      metadata: item.metadata,
    }));

    // Enviar lote para o Pinecone
    await index.namespace(NAMESPACE).upsert(pineconeRecords);
  } catch (error: any) {
    console.error(`Erro ao processar lote: ${error.message}`);
    // Delay de segurança e retentativa
    await new Promise(r => setTimeout(r, 5000));
    try {
      const texts = batch.map(item => item.text);
      const vectors = await generateEmbeddingsBatch(texts);

      const pineconeRecords = batch.map((item, i) => ({
        id: item.id,
        values: vectors[i],
        metadata: item.metadata,
      }));

      await index.namespace(NAMESPACE).upsert(pineconeRecords);
      console.log('-> Retentativa bem sucedida!');
    } catch {
      failedBatches.push(...batch.map((item: any) => item.id));
      console.error('Falha fatal no lote. Pulando.');
    }
  }
}

ingest().catch(console.error);
