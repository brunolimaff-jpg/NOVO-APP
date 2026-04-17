import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanels from '../../../components/chat/ChatPanels';
import type { RadarProps } from '../../../components/chat/contracts';

vi.mock('../../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (loader: () => Promise<unknown>) => loader(),
}));

vi.mock('../../../components/SuspenseWithError', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../components/InvestigationDashboard', () => ({
  default: ({ onSelectEmpresa, onClose }: { onSelectEmpresa: (empresa: string) => void; onClose: () => void }) => (
    <div data-testid="investigation-dashboard">
      <button type="button" onClick={() => onSelectEmpresa('Acme Agro')}>
        select-company
      </button>
      <button type="button" onClick={onClose}>
        close-dashboard
      </button>
    </div>
  ),
}));

vi.mock('../../../components/SettingsDrawer', () => ({
  default: ({ onClose, onOpenDashboard }: { onClose: () => void; onOpenDashboard: () => void }) => (
    <div data-testid="settings-drawer">
      <button type="button" onClick={onOpenDashboard}>
        open-dashboard-from-settings
      </button>
      <button type="button" onClick={onClose}>
        close-settings
      </button>
    </div>
  ),
}));

vi.mock('../../../components/WarRoom', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="war-room">
      <button type="button" onClick={onClose}>
        close-war-room
      </button>
    </div>
  ),
}));

vi.mock('../../../components/RadarPanel', () => ({
  default: ({ onOpenSettings, onClose }: { onOpenSettings: () => void; onClose: () => void }) => (
    <div data-testid="radar-panel">
      <button type="button" onClick={onOpenSettings}>
        open-radar-settings
      </button>
      <button type="button" onClick={onClose}>
        close-radar-panel
      </button>
    </div>
  ),
}));

vi.mock('../../../components/RadarSettings', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="radar-settings">
      <button type="button" onClick={onClose}>
        close-radar-settings
      </button>
    </div>
  ),
}));

function buildRadar(): RadarProps {
  return {
    alerts: [],
    metaInsight: null,
    config: {
      enabled: true,
      categories: [],
      estados: [],
      scanIntervalHours: 24,
      isConfigured: true,
    },
    unreadCount: 0,
    isScanning: false,
    lastScanAt: null,
    lastError: null,
    lastWarning: null,
    onUpdateConfig: vi.fn(),
    onMarkAsRead: vi.fn(),
    onMarkAllAsRead: vi.fn(),
    onDismiss: vi.fn(),
    onForceScan: vi.fn(),
  };
}

function buildProps(overrides: Partial<React.ComponentProps<typeof ChatPanels>> = {}): React.ComponentProps<typeof ChatPanels> {
  return {
    showDashboard: false,
    onSelectEmpresa: vi.fn(),
    onCloseDashboard: vi.fn(),
    showSettings: false,
    operatorName: 'Bruno Lima',
    onUpdateOperatorName: vi.fn(),
    mode: 'investigacao',
    onSetMode: vi.fn(),
    isDarkMode: false,
    onToggleTheme: vi.fn(),
    onOpenDashboard: vi.fn(),
    onExportPDF: vi.fn(),
    onExportConversation: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onScheduleFollowUp: vi.fn(),
    onClearOperator: vi.fn(),
    exportStatus: 'idle',
    exportError: null,
    canAccessDashboard: true,
    canAccessIntegrityCheck: true,
    onCloseSettings: vi.fn(),
    showWarRoom: false,
    canWarRoom: false,
    onCloseWarRoom: vi.fn(),
    showRadarPanel: false,
    radar: undefined,
    onOpenRadarSettings: vi.fn(),
    onCloseRadarPanel: vi.fn(),
    showRadarSettings: false,
    onCloseRadarSettings: vi.fn(),
    ...overrides,
  };
}

describe('ChatPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza dashboard, settings e war room com wiring de callbacks', async () => {
    const props = buildProps({
      showDashboard: true,
      showSettings: true,
      showWarRoom: true,
      canWarRoom: true,
    });

    render(<ChatPanels {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('investigation-dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('settings-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('war-room')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-company' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-dashboard-from-settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-war-room' }));

    expect(props.onSelectEmpresa).toHaveBeenCalledWith('Acme Agro');
    expect(props.onCloseDashboard).toHaveBeenCalled();
    expect(props.onOpenDashboard).toHaveBeenCalled();
    expect(props.onCloseSettings).toHaveBeenCalled();
    expect(props.onCloseWarRoom).toHaveBeenCalled();
  });

  it('renderiza radar panel e radar settings com wiring de open e close', async () => {
    const props = buildProps({
      showRadarPanel: true,
      showRadarSettings: true,
      radar: buildRadar(),
    });

    render(<ChatPanels {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('radar-panel')).toBeInTheDocument();
      expect(screen.getByTestId('radar-settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'open-radar-settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-radar-panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-radar-settings' }));

    expect(props.onOpenRadarSettings).toHaveBeenCalled();
    expect(props.onCloseRadarPanel).toHaveBeenCalled();
    expect(props.onCloseRadarSettings).toHaveBeenCalled();
  });
});
