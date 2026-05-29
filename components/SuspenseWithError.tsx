import React, { Component } from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class SuspenseErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.errorFallback ?? (
          <div className="p-4 text-sm text-red-400 text-center">
            Falha ao carregar componente.{' '}
            <button className="underline hover:text-red-300" onClick={() => this.setState({ hasError: false })}>
              Tentar novamente
            </button>
          </div>
        )
      );
    }
    return <React.Suspense fallback={this.props.fallback ?? null}>{this.props.children}</React.Suspense>;
  }
}

export default SuspenseErrorBoundary;
