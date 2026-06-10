import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../../utils/loadingCuriosities';
import { sanitizeLoadingContextText } from '../../utils/textCleaners';
import { scoutDiag } from '../../utils/diagnosticLog';
import { proxyGenerateContent } from '../geminiProxy';
import { LOADING_CURIOSITY_MODEL_ID, ROUTER_MODEL_ID } from './config';

export async function generateLoadingCuriosities(loadingContext: string, searchQuery: string): Promise<string[]> {
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
    const prompt = `<task>
Gerar prévias de valor para a tela de carregamento do Senior Scout 360 enquanto o dossiê comercial é produzido.
</task>

<context>
Empresa ou contexto em análise: "${safeContext}"
Consulta original: "${querySample}"
Tempo médio da pesquisa completa: 3 a 5 minutos.
</context>

<objective>
As frases devem fazer o vendedor sentir que está vendo uma amostra útil do que virá no dossiê: sinais seguros, hipóteses comerciais e próximos pontos de validação.
</objective>

<output_contract>
Responda exclusivamente com JSON neste formato:
{
  "empresa": ["2 a 3 frases sobre sinais da empresa"],
  "setor": ["2 a 3 frases sobre setor, mercado ou cadeia de valor"],
  "regional": ["1 a 2 frases sobre região quando houver localização explícita"],
  "senior": ["1 a 2 frases sobre possíveis ângulos de conversa para Senior"]
}
Cada frase deve ter no máximo 180 caracteres.
</output_contract>

<content_rules>
- Linguagem executiva, comercial e segura.
- Use termos como "sinal a validar", "ponto de atenção", "hipótese de dor" e "ângulo de conversa".
- Não afirme fatos específicos sem fonte explícita no contexto.
- Não diga que a empresa usa, precisa ou comprará produto Senior.
- Não use "segredos", "ocultos", "infiltrando", "desconstruindo", "expondo" ou "inteligência de guerra".
- Não invente estatísticas de autoridade da Senior.
- No grupo "senior", fale de possibilidades comerciais amplas: controle, produtividade, integração operacional, decisão com dados, risco e margem.
${regionalLine}
${regionalRule}
</content_rules>

<examples>
{
  "empresa": [
    "Prévia da conta: sinais cadastrais e operacionais ajudam a separar fato confirmado de hipótese comercial.",
    "Ponto de atenção: entender operação, risco e tomada de decisão antes de sugerir abordagem."
  ],
  "setor": [
    "Hipótese de dor: margem, logística e previsibilidade costumam orientar conversas de valor neste setor."
  ],
  "regional": [
    "Contexto regional entra como sinal de pressão competitiva, disponibilidade logística e timing comercial."
  ],
  "senior": [
    "Ângulo Senior: se houver dor de controle, a conversa pode partir de produtividade e decisão com dados."
  ]
}
</examples>`;
    try {
      const flashResponse = await proxyGenerateContent({
        model: LOADING_CURIOSITY_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.6, maxOutputTokens: 900 },
      });
      const parsed = parseLoadingCuriosities(flashResponse.text || '', safeContext);
      if (parsed.length > 0) return parsed;
    } catch (err) {
      scoutDiag.warn('Auxiliary', 'Flash model indisponível, fallback para Router', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const routerResponse = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.6, maxOutputTokens: 900 },
    });
    return parseLoadingCuriosities(routerResponse.text || '', safeContext);
  } catch (err) {
    scoutDiag.warn('Auxiliary', 'Falha ao gerar curiosidades de loading (usando fallback)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}
