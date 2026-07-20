import React from 'react';
import { loadWithChunkRetry } from '../../utils/chunkRetry';
import SuspenseWithError from '../SuspenseWithError';

const SettingsDrawer = React.lazy(() => loadWithChunkRetry(() => import('../SettingsDrawer')));

interface ChatPanelsProps {
  showSettings: boolean;
  operatorName: string;
  onUpdateOperatorName: (name: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onClearOperator?: () => void;
  onCloseSettings: () => void;
}

const ChatPanels: React.FC<ChatPanelsProps> = ({
  showSettings,
  operatorName,
  onUpdateOperatorName,
  isDarkMode,
  onToggleTheme,
  onClearOperator,
  onCloseSettings,
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
          />
        </SuspenseWithError>
      </React.Suspense>
    )}
  </>
);

export default ChatPanels;
