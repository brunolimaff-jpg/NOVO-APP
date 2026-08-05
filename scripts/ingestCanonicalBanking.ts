import { Pinecone } from '@pinecone-database/pinecone';
import { embedViaLiteLLM, EMBEDDINGS_MODEL_ID } from '../utils/llm/embeddings.ts';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_INDEX_NAME = process.env.PINECONE_DOCS_INDEX || 'scout-arsenal';
const PINECONE_API_KEY =
  process.env.PINECONE_DOCS_KEY || process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_KEY || '';

const NAMESPACE = 'senior-erp-docs';
const SOURCE_URL =
  'https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm';
const AUX_URL =
  'https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/processos-automaticos/166-integracao-erp-banking.htm';

const CANONICAL_DOC = `
# DOCUMENTAÇÃO TÉCNICA: INTEGRAÇÃO BANCÁRIA E OPEN FINANCE NO ERP SENIOR SISTEMAS

## 1. Arquitetura de Integração: API-First vs. Modelo Tradicional (CNAB)
A solução de ERP Banking da Senior representa uma transição do modelo tradicional de troca de arquivos (EDI/CNAB 240 e 400) para arquitetura API-First.
Modelo tradicional: fluxo em lote por remessa e retorno.
Modelo atual: integrações REST em tempo real e atualização assíncrona por webhooks.

## 2. Papel do Open Finance no ERP Senior
Open Finance (BACEN) habilita centralização financeira no ERP.
Fase 2 (dados): saldos, extratos e histórico com consentimento OAuth2.
Fase 3 (ITP): iniciação de pagamento no ERP com autorização no banco da conta.

## 3. Fluxos Operacionais
### 3A. Cobrança (Boletos e PIX)
Registro online de cobrança ao faturar.
PIX com QR dinâmico vinculado ao TxId.
Baixa automática por webhook no contas a receber.

### 3B. Pagamentos (Contas a Pagar)
Agendamento via API.
Controle de alçadas no ERP ou integrado ao banco.
Comprovante autenticado de liquidação anexado ao título.

### 3C. Conciliação Bancária
Extrato via API em vez de OFX/OFC manual.
Matching por valor, data e documento para conciliação automática.

## 4. Segurança e Protocolos
mTLS para canal seguro ponta a ponta.
OAuth 2.0 e OpenID Connect para consentimento e tokens de curta duração.
Criptografia em repouso para dados sensíveis.

## 5. BaaS e Ecossistema
Além de bancos tradicionais, há atuação no modelo BaaS, incluindo parceria com BTG Pactual Empresas.

## 6. Mapeamento canônico para benchmark (Senior vs TOTVS)
ERP Banking da Senior: pagamento eletrônico abrangente (ACH, cartões e transferências), conciliação e ecossistema financeiro embarcado.
TOTVS (Protheus): excelente registro online de títulos e boletos via API, reduzindo dependência de CNAB em cenários específicos.
Regra: em contexto bancário, contrastar API de boletos/títulos com governança de pagamentos e conciliação do ERP Banking.
`;

function chunkText(input: string, max = 1200, overlap = 180): string[] {
  const parts = input
    .split(/\n##\s+/)
    .map((s, i) => (i === 0 ? s : `## ${s}`))
    .map(s => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= max) {
      chunks.push(part);
      continue;
    }
    let start = 0;
    while (start < part.length) {
      const end = Math.min(part.length, start + max);
      chunks.push(part.slice(start, end));
      if (end >= part.length) break;
      start = Math.max(0, end - overlap);
    }
  }
  return chunks;
}

async function run() {
  if (!PINECONE_API_KEY) throw new Error('PINECONE_API_KEY ausente');

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index(PINECONE_INDEX_NAME).namespace(NAMESPACE);

  const chunks = chunkText(CANONICAL_DOC);
  const contents = chunks.map(
    (c, i) => `Fonte Curada ERP Banking Senior (Mar/2026)\nTrecho ${i + 1}/${chunks.length}\n\n${c}`,
  );

  const embedding = await embedViaLiteLLM(contents, { model: EMBEDDINGS_MODEL_ID });

  const ts = Date.now();
  const vectors = embedding.vectors.map((values, i) => ({
    id: `erp-banking-canonical-${ts}-${i + 1}`,
    values,
    metadata: {
      categoria: 'ERP Banking',
      titulo: `ERP Banking Senior - Base Curada ${i + 1}`,
      url: SOURCE_URL,
      source: 'curadoria-manual-cursor',
      tags: 'ERP Senior,Banking,Open Finance,API,Conciliação,Integração Bancária,BTG',
      kind: 'canonical-banking',
      aux_url: AUX_URL,
      text: contents[i],
    },
  }));

  await index.upsert(vectors);
  console.log(
    JSON.stringify({ ok: true, upserted: vectors.length, namespace: NAMESPACE, index: PINECONE_INDEX_NAME }, null, 2),
  );
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
