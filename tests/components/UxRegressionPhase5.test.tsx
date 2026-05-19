import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionsSidebar from '../../components/SessionsSidebar';
import RadarPanel from '../../components/RadarPanel';
import type { ChatSession, RadarAlert } from '../../types';

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

const baseAlert: RadarAlert = {
  id: 'radar-1',
  title: 'Movimento relevante no setor',
  summary: 'Resumo de teste para o alerta.',
  sourceUrl: 'https://example.com/noticia',
  sourceName: 'Fonte Teste',
  category: 'mercado',
  relevance: 'alta',
  publishedAt: '2026-03-20',
  scannedAt: new Date().toISOString(),
  read: false,
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

  it('shows radar warning/error feedback and allows retry action', () => {
    const onForceScan = vi.fn();

    render(
      <RadarPanel
        alerts={[baseAlert]}
        metaInsight={null}
        isScanning={false}
        lastScanAt={Date.now()}
        scanWarning="Varredura parcial: alguns temas falharam (mercado)."
        scanError={{
          code: 'RADAR_SERVER',
          message: 'O serviço do Radar está instável no momento. Tente novamente em instantes.',
          retryable: true,
        }}
        unreadCount={1}
        isConfigured={true}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
        onForceScan={onForceScan}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
        isDarkMode={false}
      />,
    );

    expect(screen.getByText(/Varredura parcial/i)).toBeInTheDocument();
    expect(screen.getByText(/Falha na varredura \(RADAR_SERVER\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(onForceScan).toHaveBeenCalledTimes(1);
  });
});
