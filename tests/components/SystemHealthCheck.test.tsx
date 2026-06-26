import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemHealthCheck from '../../components/SystemHealthCheck';

const { buscarContextoPineconeMock, buscarContextoDocsPineconeMock, lookupClienteMock, proxyGeminiHealthMock } =
  vi.hoisted(() => ({
    buscarContextoPineconeMock: vi.fn(),
    buscarContextoDocsPineconeMock: vi.fn(),
    lookupClienteMock: vi.fn(),
    proxyGeminiHealthMock: vi.fn(),
  }));

vi.mock('../../services/ragService', () => ({
  buscarContextoPinecone: buscarContextoPineconeMock,
  buscarContextoDocsPinecone: buscarContextoDocsPineconeMock,
}));

vi.mock('../../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
}));

vi.mock('../../services/llmProxy', () => ({
  proxyGeminiHealth: proxyGeminiHealthMock,
}));

vi.mock('../../services/apiConfig', () => ({
  BACKEND_URL: 'https://backend.example.com',
}));

vi.mock('../../utils/featureAccess', () => ({
  getFeatureAccess: () => ({ clientLookup: true }),
}));

describe('SystemHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    proxyGeminiHealthMock.mockResolvedValue({ ok: true });
    lookupClienteMock.mockResolvedValue({ ok: true });
    buscarContextoPineconeMock.mockResolvedValue({ context: '', failed: true });
    buscarContextoDocsPineconeMock.mockResolvedValue({ context: '', failed: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      } as Response),
    );
  });

  it('reclassifica RAG vazio como opcional degradado sem reprovar os checks críticos', async () => {
    render(<SystemHealthCheck isDarkMode={false} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(screen.getByText('✅ Sistema Operacional')).toBeInTheDocument();
    });

    expect(screen.getByText('5/5 checks críticos passaram')).toBeInTheDocument();
    expect(screen.getByText('2 check opcional do War Room está degradado')).toBeInTheDocument();
    expect(screen.getByText('🧠 War Room - Base Interna (opcional)')).toBeInTheDocument();
    expect(screen.getByText('📚 War Room - Documentação (opcional)')).toBeInTheDocument();
    expect(screen.getAllByText(/Vazio \(0ms\)|Vazio \(\d+ms\)/i).length).toBeGreaterThanOrEqual(2);
  });
});
