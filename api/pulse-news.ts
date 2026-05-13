import { DEFAULT_GEMINI_MODEL } from './_shared/gemini-helpers';
import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

export const config = { runtime: 'nodejs' };

const RequestSchema = z.object({
  companyName: z.string().min(2),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Nome da empresa inválido' });

    const { companyName } = parsed.data;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const prompt = `Você é um analista de inteligência comercial.
Busque notícias recentes sobre "${companyName}" no agronegócio ou tecnologia.

Entregue um "Resumo Comercial Direto":
1. Título e Fonte (se disponível).
2. Resumo do fato: máximo 3 frases diretas.
3. Gatilho Comercial: por que isso importa para o vendedor da Senior Sistemas? Como ele pode usar essa informação para abordar o cliente?

Seja objetivo, profissional e foque em valor comercial.`;

    const chat = ai.chats.create({ model: DEFAULT_GEMINI_MODEL, config: { temperature: 0.2 } });
    const response = await chat.sendMessage({ message: prompt });

    return res.status(200).json({ summary: response.text });
  } catch (error) {
    return res
      .status(500)
      .json({ error: 'Erro ao buscar Pulse360', details: error instanceof Error ? error.message : 'Unknown' });
  }
}
