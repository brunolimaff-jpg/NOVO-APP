import React from 'react';
import {
  buildUiErrorReport,
  generateUiErrorId,
  persistUiErrorAudit,
} from '../../utils/errorBoundaryAudit';

interface DossierErrorBoundaryProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
  variant?: 'inline' | 'overlay';
}

interface DossierErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  errorId: string;
}

export class DossierErrorBoundary extends React.Component<
  DossierErrorBoundaryProps,
  DossierErrorBoundaryState
> {
  constructor(props: DossierErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<DossierErrorBoundaryState> {
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
    const variant = this.props.variant ?? 'inline';
    const shellClass =
      variant === 'overlay'
        ? 'fixed inset-4 z-[95] flex items-center justify-center pointer-events-none'
        : 'w-full';
    const cardClass =
      variant === 'overlay'
        ? 'pointer-events-auto max-w-lg'
        : 'max-w-3xl';

    return (
      <div data-testid="dossier-error-boundary" className={shellClass}>
        <div
          role="alert"
          className={`${cardClass} rounded-2xl border px-4 py-4 shadow-lg ${
            isDarkMode ? 'border-amber-700/50 bg-slate-900 text-slate-100' : 'border-amber-200 bg-amber-50 text-slate-900'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Dossier fallback</p>
          <p className="mt-2 text-sm font-semibold">Nao foi possivel renderizar este bloco do dossier.</p>
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            O restante do chat continua disponivel. Remonte apenas este trecho ou recarregue o app se o problema persistir.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-white'
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

export default DossierErrorBoundary;
