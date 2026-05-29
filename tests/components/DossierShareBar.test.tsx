import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/storage', () => ({
  storage: {
    shareDossier: vi.fn(),
  },
}));

Object.defineProperty(window, 'location', {
  value: { origin: 'https://scoutagro.app' },
  writable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

describe('DossierShareBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza estado inicial com Copiar link e Teams desabilitado', async () => {
    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    expect(screen.getByText('Dossiê concluído')).toBeDefined();
    expect(screen.getByText('Copiar link')).toBeDefined();
    const teamsBtn = screen.getByText('Teams');
    expect(teamsBtn).toBeDefined();
    expect((teamsBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('copia link e habilita Teams ao clicar em Copiar', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-abc-123');

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://scoutagro.app/dossie/token-abc-123',
      );
    });

    const teamsBtn = screen.getByText('Teams');
    expect((teamsBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('mostra "Copiado" após clique bem-sucedido', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-456');

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeDefined();
    });
  });

  it('abre deep link do Teams com URL codificada', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-789');

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      const teamsBtn = screen.getByText('Teams');
      expect((teamsBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByText('Teams'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://teams.microsoft.com/l/message/'),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });
});
