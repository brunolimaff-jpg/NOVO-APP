import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const relevantKeys = Object.keys(process.env).filter(k =>
    k.includes('CNPJ') || k.includes('API_KEY') || k.includes('GEMINI') || k.includes('SUPABASE')
  );
  res.status(200).json({
    hasCnpjKey: 'CNPJABERTO_API_KEY' in process.env,
    cnpjKeyType: typeof process.env.CNPJABERTO_API_KEY,
    cnpjKeyLen: process.env.CNPJABERTO_API_KEY?.length || 0,
    relevantKeys,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
