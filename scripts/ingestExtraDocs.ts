import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedViaLiteLLM, EMBEDDINGS_MODEL_ID } from '../utils/llm/embeddings.ts';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do .env na raiz
dotenv.config({ path: path.join(__dirname, '../.env') });

const PINECONE_API_KEY = process.env.PINECONE_DOCS_KEY || process.env.VITE_PINECONE_KEY || process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_DOCS_INDEX || 'scout-arsenal';

if (!PINECONE_API_KEY) {
  console.error(
    'ERRO: Variáveis de ambiente ausentes. Verifique PINECONE_API_KEY (ou PINECONE_DOCS_KEY) e as vars LiteLLM (LITELLM_BASE_URL/LITELLM_API_KEY).',
  );
  process.exit(1);
}
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX_NAME);
const NAMESPACE = 'senior-erp-docs';
const BATCH_SIZE = 50;

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const result = await embedViaLiteLLM(texts, { model: EMBEDDINGS_MODEL_ID });
  return result.vectors;
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
    await index.namespace(NAMESPACE).upsert(pineconeRecords);
  } catch (error: any) {
    console.error(`Erro ao processar lote: ${error.message}`);
    await new Promise(r => setTimeout(r, 5000));
    try {
      const texts = batch.map(item => item.text);
      const vectors = await generateEmbeddingsBatch(texts);
      const pineconeRecords = batch.map((item, i) => ({ id: item.id, values: vectors[i], metadata: item.metadata }));
      await index.namespace(NAMESPACE).upsert(pineconeRecords);
      console.log('-> Retentativa bem sucedida!');
    } catch {
      console.error('Falha fatal no lote. Pulando.');
    }
  }
}

async function ingestAgro() {
  const csvPath = path.join(__dirname, '../Links documentação/senior_agro_consolidado.csv');
  console.log(`Lendo arquivo: ${csvPath}`);
  const parser = fs
    .createReadStream(csvPath, { encoding: 'utf8' })
    .pipe(parse({ columns: true, skip_empty_lines: true }));
  let buffer: any[] = [];
  let successCount = 0;

  for await (const row of parser) {
    const r = row as any;
    // Header: Portal,Produto,Módulo,Título,URL
    const titulo = Object.keys(r).find(k => k.includes('tulo' /* Título */)) || 'Título';
    const modulo = Object.keys(r).find(k => k.includes('dulo' /* Módulo */)) || 'Módulo';
    if (!r.URL || r.URL.trim() === '') continue;

    const textToEmbed = `Manual Senior Agro | Portal: ${r.Portal} | Produto: ${r.Produto} | Módulo: ${r[modulo]} | Título: ${r[titulo]}`;

    const agroId = `agro-doc-${crypto.createHash('sha1').update(r.URL).digest('hex').slice(0, 20)}`;
    buffer.push({
      id: agroId,
      text: textToEmbed,
      metadata: { categoria: r[modulo] || r.Produto || 'Agro', titulo: r[titulo] || '', url: r.URL },
    });

    if (buffer.length >= BATCH_SIZE) {
      await processBatch(buffer);
      successCount += buffer.length;
      console.log(`[AGRO] Progresso: ${successCount} links processados...`);
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    await processBatch(buffer);
    successCount += buffer.length;
  }
  console.log(`\n🎉 Finalizado! ${successCount} documentos do AGRO inseridos no Pinecone no namespace '${NAMESPACE}'.`);
}

async function ingestFlow() {
  const csvPath = path.join(__dirname, '../Links documentação/senior_flow_links.csv');
  console.log(`Lendo arquivo: ${csvPath}`);
  const parser = fs
    .createReadStream(csvPath, { encoding: 'utf8' })
    .pipe(parse({ columns: true, skip_empty_lines: true }));
  let buffer: any[] = [];
  let successCount = 0;

  for await (const row of parser) {
    const r = row as any;
    // Header: Categoria,Título,Caminho,URL Completa
    const titulo = Object.keys(r).find(k => k.includes('tulo' /* Título */)) || 'Título';
    const urlCompleta = r['URL Completa'] || r.URL || Object.keys(r).find(k => k.includes('URL'));
    if (!urlCompleta || urlCompleta.trim() === '') continue;

    const textToEmbed = `Manual Senior Flow / HCM | Categoria: ${r.Categoria} | Caminho: ${r.Caminho} | Título: ${r[titulo]}`;

    const flowId = `flow-doc-${crypto.createHash('sha1').update(urlCompleta).digest('hex').slice(0, 20)}`;
    buffer.push({
      id: flowId,
      text: textToEmbed,
      metadata: { categoria: r.Categoria || 'Flow/XPlatform', titulo: r[titulo] || '', url: urlCompleta },
    });

    if (buffer.length >= BATCH_SIZE) {
      await processBatch(buffer);
      successCount += buffer.length;
      console.log(`[FLOW] Progresso: ${successCount} links processados...`);
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    await processBatch(buffer);
    successCount += buffer.length;
  }
  console.log(`\n🎉 Finalizado! ${successCount} documentos do FLOW inseridos no Pinecone no namespace '${NAMESPACE}'.`);
}

async function run() {
  await ingestAgro();
  await ingestFlow();
}

run().catch(console.error);
