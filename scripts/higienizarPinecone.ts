import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const PINECONE_API_KEY =
  process.env.PINECONE_DOCS_KEY || process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_KEY || '';

const MAIN_INDEX = process.env.PINECONE_DOCS_INDEX || 'scout-arsenal';
const ORPHAN_INDEX = 'documentacao';
const NAMESPACE = 'senior-erp-docs';

if (!PINECONE_API_KEY) {
  console.error('ERRO: PINECONE_API_KEY ausente.');
  process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });

async function deleteOrphanIndex() {
  console.log(`\n🗑️  Deletando índice órfão: ${ORPHAN_INDEX}...`);
  try {
    await pc.deleteIndex(ORPHAN_INDEX);
    console.log(`✅ Índice "${ORPHAN_INDEX}" deletado.`);
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      console.log(`ℹ️  Índice "${ORPHAN_INDEX}" já não existe.`);
    } else {
      console.error(`❌ Erro ao deletar "${ORPHAN_INDEX}": ${error.message}`);
    }
  }
}

async function reportIndexStats() {
  console.log(`\n📊 Estatísticas do índice "${MAIN_INDEX}":`);
  const stats = await pc.index(MAIN_INDEX).describeIndexStats();
  for (const [ns, info] of Object.entries(stats.namespaces ?? {})) {
    console.log(`  namespace "${ns || '(default)'}": ${(info as any).recordCount} registros`);
  }
  console.log(`  Total: ${stats.totalRecordCount} registros`);
}

async function deduplicateNamespace() {
  console.log(`\n🔍 Verificando duplicatas no namespace "${NAMESPACE}"...`);
  const index = pc.index(MAIN_INDEX).namespace(NAMESPACE);

  // Lista registros com prefixo comum (serverless só suporta list por prefixo)
  const seenUrls = new Map<string, { count: number; hasText: boolean; ids: string[] }>();
  let totalListed = 0;
  let paginationToken: string | undefined;

  try {
    do {
      const page: any = await index.listPaginated({
        prefix: 'senior-doc-',
        limit: 100,
        paginationToken,
      });

      for (const id of (page.vectors ?? []) as Array<{ id: string }>) {
        totalListed++;
        // O ID já contém o hash da URL (Fase 0.3) — não conseguimos extrair a URL só do ID.
        // Mas podemos detectar duplicatas parciais comparando IDs sem o sufixo de chunk.
        const baseId = (id.id || (id as unknown as string)).replace(/-chunk-\d+$/, '');
        const existing = seenUrls.get(baseId);
        if (existing) {
          existing.count++;
          existing.ids.push(id.id || (id as unknown as string));
        } else {
          seenUrls.set(baseId, { count: 1, hasText: false, ids: [id.id || (id as unknown as string)] });
        }
      }
      paginationToken = page.pagination?.next;
    } while (paginationToken);

    const duplicates = [...seenUrls.entries()].filter(([, info]) => info.count > 1);
    const totalDuplicateRecords = duplicates.reduce((sum, [, info]) => sum + info.count - 1, 0);

    console.log(`  Listados: ${totalListed} registros`);
    console.log(`  URLs únicas: ${seenUrls.size}`);
    console.log(`  URLs com duplicatas: ${duplicates.length}`);
    console.log(`  Registros duplicados (extras): ${totalDuplicateRecords}`);

    if (duplicates.length > 0) {
      console.log('\n📋 Exemplos de duplicatas:');
      duplicates.slice(0, 5).forEach(([baseId, info]) => {
        console.log(`  ${baseId}: ${info.count} registros`);
      });
    } else {
      console.log('  ✅ Nenhuma duplicata encontrada.');
    }
  } catch (error: any) {
    console.error(`❌ Erro ao listar registros: ${error.message}`);
    console.error(
      '   (listPaginated pode não estar disponível neste índice — necessário upgrade para serverless com paginação)',
    );
  }
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (dryRun) {
    console.log('🔍 MODO DRY-RUN — use --execute para aplicar as alterações\n');
  } else {
    console.log('⚠️  MODO EXECUÇÃO — alterações serão aplicadas\n');
  }

  await reportIndexStats();

  if (dryRun) {
    console.log('\n🔍 DRY-RUN: verificaria duplicatas...');
  }
  await deduplicateNamespace();

  if (dryRun) {
    console.log(`\n🔍 DRY-RUN: deletaria índice "${ORPHAN_INDEX}"`);
    console.log('\nPara executar: npx tsx scripts/higienizarPinecone.ts --execute');
  } else {
    await deleteOrphanIndex();
    console.log('\n✅ Higienização concluída.');
    await reportIndexStats();
  }
}

run().catch(console.error);
