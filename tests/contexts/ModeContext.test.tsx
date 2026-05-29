// tests/contexts/ModeContext.test.tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { ModeProvider, useMode } from '../../contexts/ModeContext';

// Test component that displays mode info
const ModeDisplay: React.FC = () => {
  const { mode, systemInstruction, toggleMode, setMode } = useMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="instruction">{systemInstruction.slice(0, 20)}</span>
      <button data-testid="toggle" onClick={toggleMode}>
        toggle
      </button>
      <button data-testid="set-investigacao" onClick={() => setMode('investigacao')}>
        set investigacao
      </button>
    </div>
  );
};

describe('ModeContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fornece modo inicial investigacao', async () => {
    render(
      <ModeProvider>
        <ModeDisplay />
      </ModeProvider>,
    );
    // After useEffect runs (async), mode must be investigacao
    await act(async () => {});
    expect(screen.getByTestId('mode').textContent).toBe('investigacao');
  });

  it('persiste investigacao no localStorage após mount', async () => {
    render(
      <ModeProvider>
        <ModeDisplay />
      </ModeProvider>,
    );
    await act(async () => {});
    expect(localStorage.getItem('scout360_mode')).toBe('investigacao');
  });

  it('toggleMode mantém o fluxo único de investigação', async () => {
    render(
      <ModeProvider>
        <ModeDisplay />
      </ModeProvider>,
    );
    await act(async () => {});
    act(() => {
      screen.getByTestId('toggle').click();
    });
    expect(screen.getByTestId('mode').textContent).toBe('investigacao');
  });

  it('setMode mantém investigacao como modo único', async () => {
    render(
      <ModeProvider>
        <ModeDisplay />
      </ModeProvider>,
    );
    await act(async () => {});
    act(() => {
      screen.getByTestId('set-investigacao').click();
    });
    expect(screen.getByTestId('mode').textContent).toBe('investigacao');
  });

  it('systemInstruction é não-vazia', async () => {
    render(
      <ModeProvider>
        <ModeDisplay />
      </ModeProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('instruction').textContent!.length).toBeGreaterThan(0);
  });

  it('useMode fora de ModeProvider lança erro', () => {
    // Suppress React error boundary output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<ModeDisplay />);
    }).toThrow('useMode deve ser usado dentro de um ModeProvider');
    spy.mockRestore();
  });
});
