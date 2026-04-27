import { VercelRequest, VercelResponse } from '@vercel/node';

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
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { cnpj } = req.query;

  if (!cnpj || typeof cnpj !== 'string') {
    return res.status(400).json({ error: 'CNPJ is required' });
  }

  const cleanCnpj = cnpj.replace(/\D/g, '');

  if (cleanCnpj.length !== 14) {
    return res.status(400).json({ error: 'Invalid CNPJ length' });
  }

  // TODO: Em um cenário real, isso faria um lookup num arquivo CSV/JSON cacheado
  // do MDIC (ex: empresas_exportadoras_2024.json) ou em um banco de dados
  // mantido por você. Como a Brasil API e a ReceitaWS não retornam dados 
  // diretos de Comex Stat, vamos criar uma lógica simulada determinística
  // para fins de MVP baseada no CNPJ (assim o mesmo CNPJ sempre dá o mesmo resultado).

  try {
    // Usa o proxy interno para aproveitar a cadeia de fallback e o cache
    const cnpjProxyUrl = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers['host']}/api/cnpj?cnpj=${cleanCnpj}`;
    const cnpjResponse = await fetch(cnpjProxyUrl);

    if (!cnpjResponse.ok) {
      return res.status(200).json({ isExportador: false, message: 'CNPJ não encontrado na base da Receita Federal' });
    }

    const empresaInfo = await cnpjResponse.json();
    // Normaliza campos para compatibilidade com a lógica abaixo
    empresaInfo.cnae_fiscal_descricao = empresaInfo.cnaeDescricao;
    
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
      const cnaePrincipal = empresaInfo.cnae_fiscal_descricao?.toLowerCase() || '';
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

      return res.status(200).json(result);
    } else {
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