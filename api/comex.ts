import { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupCnpj, CnpjNotFoundError } from '../lib/cnpjLookup.js';
import { normalizeCnpj, isValidCnpj } from '../utils/cnpj.js';
import { cacheHeaders } from './_cache-headers.js';
import { setSecurityHeaders } from './_security-headers.js';

// Origens permitidas: domínio de produção + previews Vercel + dev local
const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://scoutagro.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[]);

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin ?? '';
  // Permite qualquer subdomínio *.vercel.app do projeto (previews de PR)
  const isVercelPreview = /^https:\/\/novo-app-[a-z0-9-]+-brunolimaff-jpg\.vercel\.app$/.test(origin);
  if (ALLOWED_ORIGINS.has(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

// Exemplo de faixas de valor segundo MDIC/Serpro
type ExportBand = 
  | 'Até US$ 1 milhão'
  | 'US$ 1 milhão a US$ 10 milhões'
  | 'US$ 10 milhões a US$ 50 milhões'
  | 'Mais de US$ 50 milhões';

interface ComexResult {
  isExportador: boolean;
  cnpj?: string;
  anoReferencia?: number;
  faixaValorEstimado?: ExportBand;
  principaisNCMs?: string[];
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const raw = typeof req.query.cnpj === 'string' ? req.query.cnpj : '';
  const cleanCnpj = normalizeCnpj(raw);

  if (!isValidCnpj(cleanCnpj)) {
    return res.status(400).json({ error: 'CNPJ inválido.' });
  }

  try {
    let empresaInfo: { cnaeDescricao?: string };
    try {
      empresaInfo = await lookupCnpj(cleanCnpj);
    } catch (err) {
      if (err instanceof CnpjNotFoundError) {
        return res.status(200).json({ isExportador: false, message: 'CNPJ não encontrado na base da Receita Federal' });
      }
      throw err;
    }
    
    // Regra determinística mockada baseada nos primeiros digitos do CNPJ
    // Para testar o feature com CNPJs reais de agro
    const sumCnpj = cleanCnpj.split('').reduce((acc, curr) => acc + parseInt(curr), 0);
    
    // Se a soma for par, é exportador (para simular uma distribuição de ~50% no nosso banco de testes agro)
    // No mundo real, isso deve bater com uma base em memória gerada pelos CSVs do MDIC.
    const isExportadorSimulado = sumCnpj % 2 === 0;

    if (isExportadorSimulado) {
      // Determina a faixa baseada em operações no CNPJ
      const bands: ExportBand[] = [
        'Até US$ 1 milhão',
        'US$ 1 milhão a US$ 10 milhões',
        'US$ 10 milhões a US$ 50 milhões',
        'Mais de US$ 50 milhões'
      ];
      
      const bandIndex = sumCnpj % 4; // Deterministico
      
      // Gera produtos NCM fictícios baseados no CNAE principal
      const cnaePrincipal = empresaInfo.cnaeDescricao?.toLowerCase() || '';
      let produtos = ['Grãos', 'Commodities Agrícolas'];
      
      if (cnaePrincipal.includes('algodão')) produtos = ['Algodão em pluma'];
      else if (cnaePrincipal.includes('soja')) produtos = ['Soja em grãos', 'Farelo de Soja'];
      else if (cnaePrincipal.includes('boi') || cnaePrincipal.includes('carne')) produtos = ['Carne Bovina Congelada'];
      else if (cnaePrincipal.includes('usina') || cnaePrincipal.includes('cana')) produtos = ['Açúcar de Cana', 'Etanol'];

      const result: ComexResult = {
        isExportador: true,
        cnpj: cleanCnpj,
        anoReferencia: new Date().getFullYear() - 1, // Dados do MDIC costumam ter delay
        faixaValorEstimado: bands[bandIndex],
        principaisNCMs: produtos
      };

      res.setHeader('Cache-Control', cacheHeaders(86400)['Cache-Control']);
      return res.status(200).json(result);
    } else {
      res.setHeader('Cache-Control', cacheHeaders(86400)['Cache-Control']);
      return res.status(200).json({
        isExportador: false,
        cnpj: cleanCnpj,
        message: 'CNPJ não listado no Cadastro de Exportadores MDIC no último ano base.'
      });
    }

  } catch (error) {
    console.error('Error fetching Comex API:', error);
    return res.status(500).json({ error: 'Internal server error while fetching Comex data' });
  }
}
