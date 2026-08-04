import * as dotenv from 'dotenv';
import { callLiteLLM } from '../api/_llm-client.ts';
dotenv.config();

const DEFAULT_MODEL = 'bedrock/deepseek.v3.2';
const CONCORRENTES_NOMES = [
  'SAP',
  'TOTVS',
  'Protheus',
  'Sankhya',
  'SIAGRI',
  'CHB Sistemas',
  'Benner',
  'LG Sistemas',
  'Viasoft',
  'Korp',
  'Unisystem',
  'Senior Sistemas',
  'GAtec',
  'SimpleFarm',
  'Aegro',
  'Solinftec',
  'Aliare',
  'Agrotitan',
  'Oracle',
  'Datasul',
];

const prompt = `Você é um Head de Inteligência de Mercado de agronegócio brasileiro.
USE A FERRAMENTA DE BUSCA NA WEB para pesquisar notícias reais dos últimos 7 dias sobre softwares de gestão para o agronegócio.
Não responda de memória.
Retorne um JSON de array contendo as notícias. Cada notícia deve ter as chaves (exatamente): "title", "summary", "sourceUrl", "sourceName", "relevance" (alta, media ou baixa), "publishedAt", "estado".

CATEGORIA: MOVIMENTOS COMPETITIVOS ERP/SOFTWARE AGRO
Empresas: ${CONCORRENTES_NOMES.join(', ')}.
Foco: lançamentos, investimentos IA, aquisições, parcerias.`;

async function main() {
  try {
    const response = await callLiteLLM({
      model: DEFAULT_MODEL,
      userContent: prompt,
      temperature: 0.6,
      maxOutputTokens: 4096,
    });
    console.log('Raw Response:');
    console.log(response.text);
  } catch (e) {
    console.error('Error calling LLM via LiteLLM:', e);
  }
}

main();
