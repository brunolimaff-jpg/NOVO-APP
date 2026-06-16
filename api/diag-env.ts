import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.CNPJABERTO_API_KEY;

  // Test CNPJ Aberto API directly
  let cnpjResult: unknown = null;
  let cnpjError: string | null = null;
  let cnpjStatus: number | null = null;

  try {
    const response = await fetch(
      'https://cnpjaberto.com.br/api/socio/empresas?nome=RODRIGO+MARX+QUEIROZ+DOS+SANTOS&limit=50',
      {
        headers: {
          'X-API-Key': apiKey || '',
          Accept: 'application/json',
          'User-Agent': 'ScoutAgro/1.0',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    cnpjStatus = response.status;
    if (response.ok) {
      const text = await response.text();
      try {
        cnpjResult = JSON.parse(text);
      } catch {
        cnpjResult = text.substring(0, 500);
      }
    } else {
      cnpjError = `HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (error) {
    cnpjError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  res.status(200).json({
    hasCnpjKey: !!apiKey,
    cnpjKeyLen: apiKey?.length || 0,
    vercelEnv: process.env.VERCEL_ENV,
    cnpjApiTest: {
      status: cnpjStatus,
      error: cnpjError,
      resultType: cnpjResult
        ? Array.isArray(cnpjResult)
          ? `array[${(cnpjResult as unknown[]).length}]`
          : typeof cnpjResult
        : null,
      resultPreview: JSON.stringify(cnpjResult).substring(0, 300),
    },
  });
}
