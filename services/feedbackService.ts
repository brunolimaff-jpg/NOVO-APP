import { Feedback } from '../types';
import { scoutDiag } from '../utils/diagnosticLog';

export interface MessageFeedback {
  messageId: string;
  feedbackType: Feedback; // 'up' | 'down'
  section: string | null;
  timestamp: string;
  questionSnapshot: string; // última pergunta do usuário antes dessa resposta
  botResponseSnapshot?: string; // (Opcional) começo da resposta do bot para contexto
}

// Buffer local temporário (no futuro, isso pode ser um cache antes do envio)
const feedbackBuffer: MessageFeedback[] = [];

/**
 * Registra o feedback do usuário.
 * No futuro, substituir o buffer local por um fetch() para o Google Apps Script.
 */
export function recordFeedback(entry: MessageFeedback) {
  feedbackBuffer.push(entry);
  
  // TODO: Enviar para Apps Script / Google Sheets via POST
  // const GOOGLE_SCRIPT_URL = "SEU_ENDPOINT_AQUI";
  // fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(entry) ... })
  
  scoutDiag.info('Feedback', 'feedback registrado no buffer local', {
    messageId: entry.messageId,
    feedbackType: entry.feedbackType,
    section: entry.section,
    timestamp: entry.timestamp,
    questionChars: entry.questionSnapshot.length,
    responseChars: entry.botResponseSnapshot?.length ?? 0,
  });
}
