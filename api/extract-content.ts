import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { universalExtract } from '../utils/documentExtractor.js';

const ExtractRequestSchema = z
  .object({
    url: z.string().url().optional(),
    // Limite de ~10MB em base64 (~13.6M chars) para prevenir DoS por alocação excessiva
    base64Content: z.string().max(13_600_000).optional(),
    mimeType: z.string().optional(),
  })
  .refine(
    data => {
      if (data.url) return true;
      if (data.base64Content && data.mimeType) return true;
      return false;
    },
    {
      message: 'Deve fornecer url ou base64Content com mimeType',
    },
  );

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = ExtractRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const result = await universalExtract(parsed.data);

    if (result.error) {
      return res.status(result.error.includes('URL restrita') ? 403 : 500).json({
        error: result.error,
      });
    }

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    scoutDiag.error('ExtractContent', 'Erro no handler de extração', { error: message });
    return res.status(500).json({ error: 'Erro interno na extração', details: message });
  }
}
