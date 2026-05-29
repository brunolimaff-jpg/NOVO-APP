// utils/renderStateClassifier.ts

export type PanelState = 'empty' | 'loading' | 'content' | 'error';

export interface PanelStateParams {
  messages: unknown[];
  hasDossierContent: boolean;
  isLoading: boolean;
  hasError: boolean;
}

export function classifyPanelState(params: PanelStateParams): PanelState {
  if (params.hasError) return 'error';
  if (params.isLoading) return 'loading';
  if (params.messages.length > 0 || params.hasDossierContent) return 'content';
  return 'empty';
}

export const VALID_PANEL_STATES: readonly PanelState[] = ['empty', 'loading', 'content', 'error'] as const;
