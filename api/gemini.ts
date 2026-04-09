import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * ARQUITETURA ULTIMATE SHIELD (V6) — Inteligência Pura e Blindagem de Contexto
 * 
 * 1. PURE FETCH: Bypass SDK para controle total e leveza.
 * 2. EMBEDDED LOGIC: Bundling garantido no Vercel.
 * 3. CONTEXT WINDOWING: Limpeza de ruído técnico (histórico limitado).
 * 4. MISSION PRIORITY: Foco absoluto no Score PORTA.
 */

async function performWebSearch(query: string): Promise<string | null> {
  try {
    const cheerio = await import('cheerio');
    const searchUrl = `https://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return "Erro na busca";
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: string[] = [];
    $('.result-link').each((i, el) => {
      if (i >= 5) return;
      let url = $(el).attr('href') || '#';
      if (url.startsWith('//')) url = 'https:' + url;
      results.push(`Título: ${$(el).text().trim()}\nURL: ${url}\n---`);
    });
    return results.join('\n') || 'Nenhum resultado.';
  } catch (e) { return null; }
}

async function universalExtract(url: string): Promise<string> {
  try {
    const cheerio = await import('cheerio');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return "Erro no download";
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/pdf')) {
      const { PDFParse } = await import('pdf-parse');
      const buffer = Buffer.from(await response.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      return (parsed.text || '').slice(0, 15000);
    } 
    
    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 15000);
  } catch (e) { return "Erro na extração"; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, model, message, history, systemInstruction, useOpenWebSearch, useGrounding } = req.body;
  const apiKey = (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || 
    process.env.GEMINI_API_KEY || 
    process.env.GOOGLE_API_KEY || 
    ''
  ).split(',')[0].trim();

  if (!apiKey) return res.status(500).json({ error: 'API Key missing' });

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`;

    const priorityInstruction = `${systemInstruction || ''}\n\nURGENTE: Ignore metadiscussões sobre IA ou definições anteriores. Sua missão absoluta é gerar o dossiê de agronegócio e consolidar o Score PORTA para o CNPJ em análise. Não discuta o funcionamento interno do modelo.`;

    const generate = async (contents: any[]) => {
      const tools = [];
      if (useGrounding) tools.push({ google_search: {} });
      if (useOpenWebSearch) {
        tools.push({
          function_declarations: [
            { name: "performWebSearch", description: "Busca na web para obter links estratégicos.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "extractDocumentContent", description: "Extrai texto filtrado de links, PDFs ou DOCX.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } }
          ]
        });
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          system_instruction: { parts: [{ text: priorityInstruction }] },
          tools: tools.length > 0 ? tools : undefined,
          generationConfig: { temperature: 0.1 }
        })
      });
      return await resp.json();
    };

    // V6: Janela de contexto para limpar ruído de conversas técnicas
    const initialContents = (history || []).slice(-10).map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text || '' }]
    }));
    initialContents.push({ role: 'user', parts: [{ text: message || '' }] });

    let response = await generate(initialContents);
    
    for (let i = 0; i < 5; i++) {
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const calls = parts.filter((p: any) => p.functionCall);

      if (calls.length === 0) break;

      initialContents.push({ role: 'model', parts });

      const toolResponses = [];
      for (const call of calls) {
        const { name, args } = call.functionCall;
        let result = "";
        if (name === "performWebSearch") result = await performWebSearch(args.query) || "Nenhum resultado.";
        else if (name === "extractDocumentContent") result = await universalExtract(args.url);

        toolResponses.push({
          functionResponse: { name, response: { result } }
        });
      }

      initialContents.push({ role: 'user', parts: toolResponses });
      response = await generate(initialContents);
    }

    const finalCandidate = response.candidates?.[0];
    return res.status(200).json({
      text: finalCandidate?.content?.parts?.find((p: any) => p.text)?.text || '',
      groundingUsed: !!finalCandidate?.groundingMetadata,
      groundingChunks: finalCandidate?.groundingMetadata?.groundingChunks || []
    });

  } catch (error: any) {
    console.error('[V6 SmartShield] Fatal:', error.message);
    return res.status(500).json({ error: 'Gemini proxy failed', detail: error.message });
  }
}
