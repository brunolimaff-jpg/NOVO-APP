import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstallPrompt from '../../components/InstallPrompt';

const usePWAMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/usePWA', () => ({
  usePWA: usePWAMock,
}));

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePWAMock.mockReturnValue({
      canInstall: false,
      isInstalled: false,
      showInstallPrompt: false,
      installApp: vi.fn(),
      dismissInstallPrompt: vi.fn(),
    });
  });

  it('renderiza o card usando o estado do hook compartilhado', () => {
    const installApp = vi.fn();
    const dismissInstallPrompt = vi.fn();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    usePWAMock.mockReturnValue({
      canInstall: true,
      isInstalled: false,
      showInstallPrompt: true,
      installApp,
      dismissInstallPrompt,
    });

    render(<InstallPrompt />);

    expect(screen.getByText('Instalar 🦅 Senior Scout 360')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(installApp).toHaveBeenCalledTimes(1);
    expect(dismissInstallPrompt).toHaveBeenCalledTimes(1);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
  });

  it('não renderiza quando o hook informa que o prompt está oculto', () => {
    render(<InstallPrompt />);

    expect(screen.queryByText('Instalar 🦅 Senior Scout 360')).not.toBeInTheDocument();
  });
});
