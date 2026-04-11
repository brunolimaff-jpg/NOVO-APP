import { Message } from '../../types';
import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../../utils/loadingCuriosities';
import { sanitizeLoadingContextText } from '../../utils/textCleaners';
import { proxyGenerateContent } from '../geminiProxy';
import { LOADING_CURIOSITY_MODEL_ID, ROUTER_MODEL_ID } from './config';

const CONTINUITY_SYSTEM = `
Você é o estrategista de continuidade do 🦅 Senior Scout 360.
Sua missão é criar ganchos comerciais que forcem o cliente a admitir um gap de gestão ou tecnologia.

DIRETRIZES DE PENSAMENTO:
1. ANCORAGEM OBRIGATÓRIA: Cada pergunta deve conter ao menos UM dado específico do contexto.
2. FOCO EM VENDAS (SENIOR): Direcione para sistemas: ERP, HCM, WMS ou GATec.
3. ESTILO "SNIPER": Se o contexto diz que a empresa cresceu, pergunte sobre o caos que isso gera.

PROIBIÇÕES:
- PROIBIDO: Iniciar perguntas com "Como você..." (muito vago).
- PROIBIDO: Perguntas genéricas que sirvam para qualquer empresa.

Responda EXCLUSIVAMENTE em Português (Brasil) usando um Array JSON de strings.
`;

export async function generateLoadingCuriosities(
  loadingContext: string,
  searchQuery: string,
): Promise<string[]> {
  const safeContext = sanitizeLoadingContextText(loadingContext || '');
  const fallback = buildLoadingCuriositiesFallback(safeContext);
  const querySample = (searchQuery || '').slice(0, 240);

  const locationFromCadastro = querySample.match(/Cidade\s*=\s*([^;,\n]+)\s*;\s*UF\s*=\s*([A-Za-z]{2})/i);
  const locationFromNaturalText = querySample.match(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`\-. ]{2,40})\s*[-/]\s*([A-Za-z]{2})\b/);
  const onlyUf = querySample.match(/\bUF\s*[:=]\s*([A-Za-z]{2})\b/i);

  const city = (locationFromCadastro?.[1] || locationFromNaturalText?.[1] || '').trim();
  const uf = (locationFromCadastro?.[2] || locationFromNaturalText?.[2] || onlyUf?.[1] || '').trim().toUpperCase();
  const regionalScope = city && uf ? `${city}/${uf}` : uf ? `UF ${uf}` : '';

  const regionalLine = regionalScope
    ? `- Curiosidades de mercado regional coerentes com a localização da empresa (${regionalScope})`
    : '- Sem localização explícita: usar curiosidades gerais do mercado brasileiro';

  const regionalRule = regionalScope
    ? `- Use contexto regional coerente com ${regionalScope}, sem presumir Mato Grosso/Centro-Oeste`
    : '- Não presumir MT/Centro-Oeste quando a localização não estiver explícita';
  try {
    const prompt = `Você é um gerador de mensagens de alto impacto (Sniper) para tela de carregamento de uma ferramenta de inteligência comercial chamada Senior Scout 360.
Contexto da investigação: "${safeContext}"
Consulta original: "${querySample}"

Gere um array JSON com 7 a 9 frases extremamente impactantes e informativas (máximo 180 caracteres cada), em português-BR, seguindo RIGOROSAMENTE esta proporção:
- [75% dos itens] FOCO NO SCOUT: Ações de "investigação profunda" que o Scout está realizando sobre a empresa "${safeContext}". Use verbos fortes e de inteligência: "Rastreando", "Desconstruindo", "Infiltrando", "Escaneando", "Expondo". Foque na sensação de que o Scout está descobrindo segredos operacionais valiosos.
- [25% dos itens] FOCO EM INOVAÇÃO SENIOR: Curiosidades de autoridade e diferenciação da Senior Sistemas ou inovações tecnológicas de ponta (IA, Agtech, Logtech).

Exemplos de tom desejado:
- "O Scout está agora cruzando dados de exportação com o histórico da Logística para expor gargalos ocultos no supply chain."
- "Desconstruindo a teia societária para identificar os reais centros de poder e influência na tomada de decisão."
- "Sabia? A tecnologia Senior orquestra os processos críticos de 1 em cada 4 grandes empresas do país."

Regras:
- Responda EXCLUSIVAMENTE com um array JSON de strings
- Tom: Premium, Executivo, Inteligência de Guerra
- No Scout: Sempre cite o nome da empresa se disponível
- Na inovação Senior: Foque em autoridade e escala nacional
${regionalLine}
${regionalRule}`;
    try {
      const flashResponse = await proxyGenerateContent({
        model: LOADING_CURIOSITY_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.6, maxOutputTokens: 900 },
      });
      const parsed = parseLoadingCuriosities(flashResponse.text || '', safeContext);
      if (parsed.length > 0) return parsed;
    } catch (err: unknown) {
      console.warn('[LoadingCuriosities] Flash model unavailable, falling back to router', err instanceof Error ? err.message : err);
    }

    const routerResponse = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.6, maxOutputTokens: 900 },
    });
    return parseLoadingCuriosities(routerResponse.text || '', safeContext);
  } catch {
    return fallback;
  }
}

export async function generateContinuityQuestion(
  messages: Message[],
  empresaAlvo: string | null,
  nomeVendedor: string,
): Promise<string[]> {
  const recentMessages = messages
    .slice(-6)
    .map(message => `${message.sender === 'user' ? 'Vendedor' : 'Scout'}: ${message.text?.slice(0, 300) || ''}`)
    .join('\n');
  const contextNote = empresaAlvo ? `Empresa em análise: ${empresaAlvo}` : '';
  const userPrompt = `${contextNote}\n\nHistórico recente:\n${recentMessages}\n\nGere 4 perguntas de continuidade estratégica para o vendedor ${nomeVendedor} usar na próxima interação. Responda como array JSON de strings.`;
  try {
    const response = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: userPrompt,
      config: { temperature: 0.8, maxOutputTokens: 800, systemInstruction: CONTINUITY_SYSTEM },
    });
    const raw = (response.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch (err: unknown) {
    console.warn('[ContinuityQuestion] falha ao gerar perguntas de continuidade', err instanceof Error ? err.message : err);
    return [];
  }
}
