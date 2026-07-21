import type { StartInvestigationPayload } from '../components/chat/contracts';

type PromptMode = 'standard' | 'executive' | 'ultraDepth';

export function resolvePromptMode(appMode: unknown): PromptMode {
  const raw = String(appMode || '').toLowerCase();

  if (raw.includes('ultra')) return 'ultraDepth';
  if (raw.includes('deep')) return 'ultraDepth';
  if (raw.includes('exec')) return 'executive';
  return 'executive';
}

export function shouldIncludeBudgetPrompt(
  payload: StartInvestigationPayload,
  promptMode: PromptMode,
): boolean {
  if (promptMode === 'ultraDepth') return true;
  if (payload.cnpj) return true;
  return false;
}
