import React from 'react';
import { buildUiErrorReport, generateUiErrorId, persistUiErrorAudit } from '../utils/errorBoundaryAudit';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
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

  private handleCopyError = () => {
    const { error, componentStack, errorId } = this.state;
    if (!error) return;
    const text = buildUiErrorReport(errorId, error, componentStack);
    navigator.clipboard.writeText(text).catch(() => {
      console.warn('[ErrorBoundary] Clipboard indisponivel');
    });
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack, errorId } = this.state;
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-gray-900 border border-red-900/50 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">🚨</div>
              <h1 className="text-xl font-bold text-white mb-1">🦅 Senior Scout 360</h1>
              <h2 className="text-base font-semibold text-red-400 mb-3">Algo deu errado</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                Ocorreu um erro inesperado. Seus dados locais estao seguros. Tente novamente ou recarregue o aplicativo.
              </p>
            </div>

            {/* Codigo do erro rastreavel */}
            {errorId && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-black/30 border border-gray-700 flex items-center justify-between">
                <span className="text-xs text-gray-500 font-mono">Codigo do erro:</span>
                <span className="text-xs text-yellow-400 font-mono font-bold">{errorId}</span>
              </div>
            )}

            {error && (
              <details className="mb-6" open>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 underline decoration-dotted mb-2">
                  Ver detalhes tecnicos
                </summary>

                {/* Mensagem principal */}
                <div className="mb-2">
                  <p className="text-xs text-gray-500 mb-1">Mensagem:</p>
                  <pre className="p-2 rounded-lg bg-black/40 text-xs text-red-300 overflow-auto max-h-20 whitespace-pre-wrap">
                    {error.message}
                  </pre>
                </div>

                {/* Stack trace JS completo */}
                {error.stack && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">Stack JavaScript (bundle minificado):</p>
                    <pre className="p-2 rounded-lg bg-black/40 text-xs text-orange-300 overflow-auto max-h-40 whitespace-pre-wrap">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {/* Component stack do React */}
                {componentStack && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">Arvore de componentes React:</p>
                    <pre className="p-2 rounded-lg bg-black/40 text-xs text-blue-300 overflow-auto max-h-40 whitespace-pre-wrap">
                      {componentStack}
                    </pre>
                  </div>
                )}

                <button
                  onClick={this.handleCopyError}
                  className="w-full mt-1 py-1.5 px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                >
                  Copiar erro completo
                </button>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors shadow-lg"
              >
                Recarregar aplicativo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
