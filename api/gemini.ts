import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * ARQUITETURA ULTIMATE SHIELD (V5) — Estabilidade de Produção Absoluta
 * 
 * 1. PURE FETCH: Eliminamos o SDK @google/genai para evitar erros de versão e tipagem.
 * 2. EMBEDDED LOGIC: Toda a extração e busca está neste arquivo para garantir 100% de bundling no Vercel.
 * 3. ZERO COLD START FAIL: Carregamento leve e execução direta via HTTPS.
 */

// --- UTILS EMBUTIDOS PARA GARANTIR BUNDLING ---

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

// --- HANDLER PRINCIPAL ---

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

    const generate = async (contents: any[]) => {
      const tools = [];
      if (useGrounding) tools.push({ google_search: {} });
      if (useOpenWebSearch) {
        tools.push({
          function_declarations: [
            { name: "performWebSearch", description: "Busca na web", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "extractDocumentContent", description: "Extrai texto de links", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } }
          ]
        });
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          tools: tools.length > 0 ? tools : undefined,
          generationConfig: { temperature: 0.15 }
        })
      });
      return await resp.json();
    };

    // Formata histórico inicial
    const initialContents = (history || []).map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));
    initialContents.push({ role: 'user', parts: [{ text: message || '' }] });

    let response = await generate(initialContents);
    
    // Loop de Function Calling manual (Shield robusto)
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
      text: finalCandidate?.content?.parts?.[0]?.text || '',
      groundingUsed: !!finalCandidate?.groundingMetadata,
      groundingChunks: finalCandidate?.groundingMetadata?.groundingChunks || []
    });

  } catch (error: any) {
    console.error('[UltimateShield] Fatal:', error.message);
    return res.status(500).json({ error: 'Gemini proxy failed', detail: error.message });
  }
}
