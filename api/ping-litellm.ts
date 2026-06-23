import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors-headers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.LITELLM_API_KEY;

  if (!baseUrl || !apiKey) {
    return res.status(500).json({ error: 'Missing LITELLM_BASE_URL or LITELLM_API_KEY', baseUrl: !!baseUrl, apiKey: !!apiKey });
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
        messages: [{ role: 'user', content: 'oi em pt-br' }],
        max_tokens: 20,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const body = await resp.text();
    return res.status(200).json({
      ok: resp.ok,
      status: resp.status,
      latencyMs: Date.now() - start,
      baseUrl,
      keyPrefix: apiKey.substring(0, 5) + '...',
      bodyPreview: body.substring(0, 500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message, latencyMs: Date.now() - start, baseUrl });
  }
}
