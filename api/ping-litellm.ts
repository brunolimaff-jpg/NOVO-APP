import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors-headers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.LITELLM_API_KEY;

  if (!baseUrl || !apiKey) {
    return res
      .status(500)
      .json({ error: 'Missing LITELLM_BASE_URL or LITELLM_API_KEY', baseUrl: !!baseUrl, apiKey: !!apiKey });
  }

  // Query params: ?chars=5000&timeout=30&model=bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0
  const chars = Math.min(Number(req.query.chars) || 0, 200_000);
  const timeoutSec = Math.min(Number(req.query.timeout) || 10, 120);
  const model = String(req.query.model || 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0');
  const maxTokens = Math.min(Number(req.query.maxTokens) || 50, 4096);

  // ?system=1 — simula systemInstruction como o waterfall faz
  const useSystem = req.query.system === '1';
  const lorem = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. ';
  const padding = chars > 0 ? lorem.repeat(Math.ceil(chars / lorem.length)).substring(0, chars) : '';
  const content = padding ? `${padding}\n\n---\n\nResponda "OK" em portugues.` : 'oi em pt-br';
  const messages = useSystem
    ? [
        { role: 'system', content: padding || 'Voce e um assistente Pre-Vendas.' },
        { role: 'user', content: 'Responda "OK"' },
      ]
    : [{ role: 'user', content }];

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const body = await resp.text();
    return res.status(200).json({
      ok: resp.ok,
      status: resp.status,
      latencyMs: Date.now() - start,
      model,
      inputChars: content.length,
      maxTokens,
      timeoutSec,
      bodyPreview: body.substring(0, 500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      error: message,
      latencyMs: Date.now() - start,
      model,
      inputChars: content.length,
      timeoutSec,
    });
  }
}
