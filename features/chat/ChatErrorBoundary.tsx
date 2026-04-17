import React from 'react';
import {
  buildUiErrorReport,
  generateUiErrorId,
  persistUiErrorAudit,
} from '../../utils/errorBoundaryAudit';

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  errorId: string;
}

export class ChatErrorBoundary extends React.Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ChatErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateUiErrorId(error.message),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const errorId = this.state.errorId || generateUiErrorId(error.message);
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack, errorId });
    persistUiErrorAudit(errorId, error, componentStack);
    console.error(buildUiErrorReport(errorId, error, componentStack));
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: '', errorId: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isDarkMode = this.props.isDarkMode ?? false;

    return (
      <div
        data-testid="chat-error-boundary"
        className={`flex h-full min-h-0 items-center justify-center p-6 ${
          isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
        }`}
      >
        <div
          className={`w-full max-w-xl rounded-2xl border p-6 shadow-xl ${
            isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Chat recovery</p>
          <h2 className="mt-2 text-xl font-semibold">O shell do chat falhou nesta renderizacao.</h2>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            O restante do aplicativo segue ativo. Tente remontar apenas o chat ou recarregue a aplicacao.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Recarregar app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ChatErrorBoundary;
