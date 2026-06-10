import { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupCnpj, CnpjNotFoundError } from '../lib/cnpjLookup.js';
import { normalizeCnpj, isValidCnpj } from '../utils/cnpj.js';
import { cacheHeaders } from './_cache-headers.js';
import { applyCors } from './_cors-headers.js';

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
  applyCors(req, res);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
        'Mais de US$ 50 milhões',
      ];

      const bandIndex = sumCnpj % 4; // Deterministico

      // Gera produtos NCM fictícios baseados no CNAE principal
      const cnaePrincipal = empresaInfo.cnaeDescricao?.toLowerCase() || '';
      let produtos = ['Grãos', 'Commodities Agrícolas'];

      if (cnaePrincipal.includes('algodão')) produtos = ['Algodão em pluma'];
      else if (cnaePrincipal.includes('soja')) produtos = ['Soja em grãos', 'Farelo de Soja'];
      else if (cnaePrincipal.includes('boi') || cnaePrincipal.includes('carne')) produtos = ['Carne Bovina Congelada'];
      else if (cnaePrincipal.includes('usina') || cnaePrincipal.includes('cana'))
        produtos = ['Açúcar de Cana', 'Etanol'];

      const result: ComexResult = {
        isExportador: true,
        cnpj: cleanCnpj,
        anoReferencia: new Date().getFullYear() - 1, // Dados do MDIC costumam ter delay
        faixaValorEstimado: bands[bandIndex],
        principaisNCMs: produtos,
      };

      res.setHeader('Cache-Control', cacheHeaders(86400)['Cache-Control']);
      return res.status(200).json(result);
    } else {
      res.setHeader('Cache-Control', cacheHeaders(86400)['Cache-Control']);
      return res.status(200).json({
        isExportador: false,
        cnpj: cleanCnpj,
        message: 'CNPJ não listado no Cadastro de Exportadores MDIC no último ano base.',
      });
    }
  } catch (error) {
    console.error('Error fetching Comex API:', error);
    return res.status(500).json({ error: 'Internal server error while fetching Comex data' });
  }
}
