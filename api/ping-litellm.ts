import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isLiteLLMEnabled, callLiteLLM } from './_llm-client.js';

export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isLiteLLMEnabled()) {
    res.status(200).json({
      status: 'disabled',
      enabled: false,
      provider: process.env.LLM_PROVIDER ?? null,
      hasBaseUrl: Boolean(process.env.LITELLM_BASE_URL),
      hasKey: Boolean(process.env.LITELLM_API_KEY),
    });
    return;
  }

  try {
    const text = await callLiteLLM({
      model: 'bedrock/us.amazon.nova-micro-v1:0',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 10,
      timeoutMs: 10_000,
    });

    res.status(200).json({
      status: 'ok',
      enabled: true,
      baseUrl: process.env.LITELLM_BASE_URL ?? null,
      responseLength: text.length,
    });
  } catch (err: unknown) {
    res.status(500).json({
      status: 'error',
      enabled: true,
      baseUrl: process.env.LITELLM_BASE_URL ?? null,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
