import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionsSidebar from '../../components/SessionsSidebar';
import type { ChatSession } from '../../types';

const baseSession: ChatSession = {
  id: 'session-1',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  cnpj: null,
  modoPrincipal: null,
  scoreOportunidade: null,
  resumoDossie: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
};


describe('UX regression - Phase 5', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('renders session rows as accessible buttons and closes sidebar on Escape (mobile)', () => {
    const onSelectSession = vi.fn();
    const onCloseMobile = vi.fn();

    render(
      <SessionsSidebar
        sessions={[baseSession]}
        currentSessionId={baseSession.id}
        onSelectSession={onSelectSession}
        onNewSession={vi.fn()}
        onDeleteSession={vi.fn()}
        isOpen={true}
        onCloseMobile={onCloseMobile}
        isDarkMode={true}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Histórico de investigações/i })).toBeInTheDocument();

    const openInvestigationButton = screen.getByRole('button', {
      name: /Abrir investigação Empresa Teste/i,
    });
    fireEvent.click(openInvestigationButton);
    expect(onSelectSession).toHaveBeenCalledWith(baseSession.id);
    expect(onCloseMobile).toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseMobile).toHaveBeenCalledTimes(2);
  });

});
