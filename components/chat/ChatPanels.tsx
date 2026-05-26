import React from 'react';
import { loadWithChunkRetry } from '../../utils/chunkRetry';
import SuspenseWithError from '../SuspenseWithError';
import type { RadarProps } from './contracts';

const SettingsDrawer = React.lazy(() =>
  loadWithChunkRetry(() => import('../SettingsDrawer')),
);
const WarRoom = React.lazy(() => loadWithChunkRetry(() => import('../WarRoom')));
const RadarPanel = React.lazy(() => loadWithChunkRetry(() => import('../RadarPanel')));
const RadarSettings = React.lazy(() => loadWithChunkRetry(() => import('../RadarSettings')));

interface ChatPanelsProps {
  showSettings: boolean;
  operatorName: string;
  onUpdateOperatorName: (name: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onClearOperator?: () => void;
  canAccessIntegrityCheck?: boolean;
  onCloseSettings: () => void;
  showWarRoom: boolean;
  canWarRoom: boolean;
  onCloseWarRoom: () => void;
  showRadarPanel: boolean;
  radar?: RadarProps;
  onOpenRadarSettings: () => void;
  onCloseRadarPanel: () => void;
  showRadarSettings: boolean;
  onCloseRadarSettings: () => void;
}

const ChatPanels: React.FC<ChatPanelsProps> = ({
  showSettings,
  operatorName,
  onUpdateOperatorName,
  isDarkMode,
  onToggleTheme,
  onClearOperator,
  canAccessIntegrityCheck = true,
  onCloseSettings,
  showWarRoom,
  canWarRoom,
  onCloseWarRoom,
  showRadarPanel,
  radar,
  onOpenRadarSettings,
  onCloseRadarPanel,
  showRadarSettings,
  onCloseRadarSettings,
}) => (
  <>
    {showSettings && (
      <React.Suspense fallback={null}>
        <SuspenseWithError>
          <SettingsDrawer
            isOpen={showSettings}
            operatorName={operatorName}
            onUpdateOperatorName={onUpdateOperatorName}
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            onClearOperator={onClearOperator}
            onClose={onCloseSettings}
            canAccessIntegrityCheck={canAccessIntegrityCheck}
          />
        </SuspenseWithError>
      </React.Suspense>
    )}

    {showWarRoom && canWarRoom && (
      <React.Suspense fallback={null}>
        <SuspenseWithError>
          <WarRoom
            isOpen={showWarRoom}
            isDarkMode={isDarkMode}
            onClose={onCloseWarRoom}
            defaultCompetitorTarget={null}
          />
        </SuspenseWithError>
      </React.Suspense>
    )}

    {showRadarPanel && radar && (
      <React.Suspense fallback={null}>
        <SuspenseWithError>
          <RadarPanel
            isDarkMode={isDarkMode}
            alerts={radar.alerts}
            metaInsight={radar.metaInsight}
            isScanning={radar.isScanning}
            lastScanAt={radar.lastScanAt}
            scanError={radar.lastError}
            scanWarning={radar.lastWarning}
            unreadCount={radar.unreadCount}
            isConfigured={radar.config.isConfigured}
            onMarkAsRead={radar.onMarkAsRead}
            onMarkAllAsRead={radar.onMarkAllAsRead}
            onDismiss={radar.onDismiss}
            onForceScan={radar.onForceScan}
            onOpenSettings={onOpenRadarSettings}
            onClose={onCloseRadarPanel}
          />
        </SuspenseWithError>
      </React.Suspense>
    )}

    {showRadarSettings && radar && (
      <React.Suspense fallback={null}>
        <SuspenseWithError>
          <RadarSettings
            isDarkMode={isDarkMode}
            config={radar.config}
            onUpdateConfig={radar.onUpdateConfig}
            lastScanAt={radar.lastScanAt}
            onClose={onCloseRadarSettings}
          />
        </SuspenseWithError>
      </React.Suspense>
    )}
  </>
);

export default ChatPanels;
