import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanels from '../../../components/chat/ChatPanels';

vi.mock('../../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (loader: () => Promise<unknown>) => loader(),
}));

vi.mock('../../../components/SuspenseWithError', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../components/InvestigationDashboard', () => ({
  default: () => <div data-testid="investigation-dashboard" />,
}));

vi.mock('../../../components/SettingsDrawer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="settings-drawer">
      <button type="button" onClick={onClose}>
        close-settings
      </button>
    </div>
  ),
}));

function buildProps(
  overrides: Partial<React.ComponentProps<typeof ChatPanels>> = {},
): React.ComponentProps<typeof ChatPanels> {
  return {
    showSettings: false,
    operatorName: 'Bruno Lima',
    onUpdateOperatorName: vi.fn(),
    isDarkMode: false,
    onToggleTheme: vi.fn(),
    onClearOperator: vi.fn(),
    onCloseSettings: vi.fn(),
    ...overrides,
  };
}

describe('ChatPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza apenas configurações com wiring de fechamento', async () => {
    const props = buildProps({ showSettings: true });

    render(<ChatPanels {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-drawer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close-settings' }));

    expect(props.onCloseSettings).toHaveBeenCalled();
  });
});
