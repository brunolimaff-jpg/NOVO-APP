import { scoutDiag } from '../../utils/diagnosticLog';
import { proxyGenerateContent } from '../geminiProxy';
import { RECOVERY_DEBUG_FLAG_KEY, ROUTER_MODEL_ID, OPEN_QUESTION_RECOVERY_METRIC_KEY } from './config';

const RECOVERY_MODULE = 'Recovery';

export function debugRecovery(stage: string, payload: Record<string, unknown>): void {
  if (!isRecoveryDebugEnabled()) return;
  try {
    console.warn(`[RecoveryDebug] ${stage}`, payload);
  } catch {
    scoutDiag.warn(RECOVERY_MODULE, 'debugRecovery console.warn falhou');
  }
}

function isRecoveryDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(RECOVERY_DEBUG_FLAG_KEY) === '1' ||
      window.localStorage.getItem(RECOVERY_DEBUG_FLAG_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export function looksLikeMissedOpenQuestionAnswer(text: string): boolean {
  if (!text) return false;
  return /((seu|sua)?\s*comando(\s+atual)?\s+veio\s+(vazi[ao]|em\s+branco)|comando\s+de\s+busca\s+veio\s+vazio|(sua\s+)?mensagem(\s+atual)?\s+veio\s+(vazi[ao]|em\s+branco)|sem\s+direcionamento(\s+espec[ií]fico)?|(digite|mande)\s+sua\s+d[uú]vida\s+espec[ií]fica|n[aã]o\s+enviou\s+um\s+novo\s+comando|radar\s+est[aá]\s+em\s+stand-?by|basta\s+mandar\s+o\s+nome\s+da\s+pr[oó]xima\s+empresa|n[aã]o\s+continha\s+texto\s+v[aá]lido|apenas\s+pontua[cç][õo]es|somente\s+pontua[cç][õo]es|n[aã]o\s+recebi\s+um\s+comando\s+claro|n[aã]o\s+ficou\s+claro\s+o\s+pedido|faltou\s+um\s+comando\s+claro|n[aã]o\s+conteve\s+uma\s+pergunta\s+clara|n[aã]o\s+continha\s+uma\s+pergunta\s+clara|n[aã]o\s+havia\s+uma\s+pergunta\s+clara|n[aã]o\s+entendi\s+o\s+que\s+voc[eê]\s+quis\s+(pedir|solicitar))/i.test(
    text,
  );
}

export async function shouldRecoverOpenQuestionByJudge(
  question: string,
  answer: string,
  confidenceThreshold: number = 0.55,
): Promise<boolean> {
  if (!question.trim() || !answer.trim()) return false;
  try {
    const response = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: `Você é um validador de alinhamento entre PERGUNTA e RESPOSTA.\n\nPERGUNTA:\n"${question}"\n\nRESPOSTA:\n"${answer.slice(0, 2500)}"\n\nRetorne EXCLUSIVAMENTE JSON:\n{\n  "shouldRetry": boolean,\n  "confidence": number,\n  "reason": "..."\n}\n\nUse shouldRetry=true quando a RESPOSTA:\n- não responde objetivamente a pergunta;\n- desvia para outro tema;\n- responde uma pergunta anterior;\n- diz que mensagem/comando veio vazio sem a pergunta estar vazia;\n- diz que faltou comando claro, texto válido ou direcionamento quando a pergunta é substantiva.`,
      config: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 400 },
    });
    const parsed = JSON.parse(
      (response.text || '{}')
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim(),
    );
    const confidence = Number(parsed?.confidence ?? 0);
    debugRecovery('judge-result', {
      shouldRetry: parsed?.shouldRetry,
      confidence,
      reason: parsed?.reason,
      threshold: confidenceThreshold,
    });
    return parsed?.shouldRetry === true && confidence >= confidenceThreshold;
  } catch (err) {
    scoutDiag.warn(RECOVERY_MODULE, 'Falha no judge de recuperação', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function trackOpenQuestionRecoveryAttempt(): void {
  if (typeof window === 'undefined') return;
  try {
    const metric = Number(window.localStorage.getItem(OPEN_QUESTION_RECOVERY_METRIC_KEY) || 0);
    window.localStorage.setItem(OPEN_QUESTION_RECOVERY_METRIC_KEY, String(metric + 1));
  } catch {
    // no-op
  }
}
