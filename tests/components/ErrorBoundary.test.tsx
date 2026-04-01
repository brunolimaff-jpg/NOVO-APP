// tests/components/ErrorBoundary.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../../components/ErrorBoundary';

// Component that throws on render
const ThrowingComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) throw new Error('Test render error');
  return <div>Normal render</div>;
};

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    // Suppress React's error output for expected throws
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renderiza filhos normalmente quando não há erro', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal render')).toBeInTheDocument();
  });

  it('exibe UI de fallback quando filho lança erro', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
  });

  it('mostra mensagem de erro na UI de fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/test render error/i)).toBeInTheDocument();
  });

  it('persiste erro no localStorage (audit trail)', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    const stored = localStorage.getItem('scout360_ui_errors_v1');
    expect(stored).not.toBeNull();
    const entries = JSON.parse(stored!);
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe('Test render error');
    expect(entries[0].level).toBe('error');
  });

  it('acumula múltiplos erros no localStorage (max 50)', () => {
    // Pre-populate with 49 entries
    const existing = Array.from({ length: 49 }, (_, i) => ({
      ts: new Date().toISOString(),
      level: 'error',
      reason: `error ${i}`,
      stack: '',
    }));
    localStorage.setItem('scout360_ui_errors_v1', JSON.stringify(existing));

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    const stored = JSON.parse(localStorage.getItem('scout360_ui_errors_v1')!);
    expect(stored.length).toBe(50);
  });

  it('mostra botão de recarregar', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /recarregar/i })).toBeInTheDocument();
  });

  it('mantém funcionamento quando localStorage está indisponível', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage quota exceeded');
    });

    // Should NOT throw — boundary handles localStorage failure gracefully
    expect(() =>
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>,
      ),
    ).not.toThrow();

    vi.restoreAllMocks();
  });
});
