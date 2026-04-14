import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const CONCORRENTES_NOMES = [
  'SAP', 'TOTVS', 'Protheus', 'Sankhya', 'SIAGRI', 'CHB Sistemas',
  'Benner', 'LG Sistemas', 'Viasoft', 'Korp', 'Unisystem',
  'Senior Sistemas', 'GAtec', 'SimpleFarm', 'Aegro', 'Solinftec',
  'Aliare', 'Agrotitan', 'Oracle', 'Datasul',
];

const prompt = `Você é um Head de Inteligência de Mercado de agronegócio brasileiro.
USE A FERRAMENTA DE BUSCA NA WEB para pesquisar notícias reais dos últimos 7 dias sobre softwares de gestão para o agronegócio.
Não responda de memória.
Retorne um JSON de array contendo as notícias. Cada notícia deve ter as chaves (exatamente): "title", "summary", "sourceUrl", "sourceName", "relevance" (alta, media ou baixa), "publishedAt", "estado".

CATEGORIA: MOVIMENTOS COMPETITIVOS ERP/SOFTWARE AGRO
Empresas: ${CONCORRENTES_NOMES.join(', ')}.
Foco: lançamentos, investimentos IA, aquisições, parcerias.`;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });
  
  const chat = ai.chats.create({
    model: DEFAULT_MODEL,
    config: {
      temperature: 0.6,
      maxOutputTokens: 4096,
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json'
    },
  });

  try {
    const response = await chat.sendMessage({ message: prompt });
    console.log("Raw Response:");
    console.log(response.text);
  } catch(e) {
    console.error("Error calling Gemini API:", e);
  }
}

main();
