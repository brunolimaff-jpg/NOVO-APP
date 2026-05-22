import React from 'react';
import { ChatMode } from '../../constants';
import { loadWithChunkRetry } from '../../utils/chunkRetry';
import type { ExportFormat, ReportType } from '../../types';
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
  mode: ChatMode;
  onSetMode: (mode: ChatMode) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onExportPDF: () => void;
  onExportConversation?: (format: ExportFormat, reportType: ReportType) => void;
  onCopyMarkdown: () => void;
  onScheduleFollowUp: () => void;
  onClearOperator?: () => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
  exportError?: string | null;
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
  mode,
  onSetMode,
  isDarkMode,
  onToggleTheme,
  onExportPDF,
  onExportConversation,
  onCopyMarkdown,
  onScheduleFollowUp,
  onClearOperator,
  exportStatus,
  exportError,
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
            mode={mode}
            onSetMode={onSetMode}
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            onExportPDF={onExportPDF}
            onExportConversation={onExportConversation}
            onCopyMarkdown={onCopyMarkdown}
            onScheduleFollowUp={onScheduleFollowUp}
            onClearOperator={onClearOperator}
            onClose={onCloseSettings}
            exportStatus={exportStatus}
            exportError={exportError}
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
