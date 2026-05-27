import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const getSyncQueueSizeMock = vi.hoisted(() => vi.fn());
const scheduleBackgroundSyncMock = vi.hoisted(() => vi.fn());
const syncAllMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/storage', () => ({
  storage: {
    getSyncQueueSize: getSyncQueueSizeMock,
    scheduleBackgroundSync: scheduleBackgroundSyncMock,
    syncAll: syncAllMock,
  },
}));

import { SyncIndicator } from '../../components/SyncIndicator';

describe('SyncIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getSyncQueueSizeMock.mockReturnValue(0);
    scheduleBackgroundSyncMock.mockClear();
    syncAllMock.mockResolvedValue({ pushed: 0, pulled: 0, errors: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra nuvem em dia sem badge', () => {
    render(<SyncIndicator isDarkMode={false} />);

    expect(screen.getByRole('button', { name: /nuvem · em dia/i })).toBeInTheDocument();
    expect(screen.queryByText('Nuvem')).not.toBeInTheDocument();
  });

  it('mostra badge com contagem pendente', () => {
    getSyncQueueSizeMock.mockReturnValue(2);

    render(<SyncIndicator isDarkMode={false} />);

    expect(screen.getByRole('button', { name: /nuvem · 2 pendentes/i })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
