import type { ChatInterfaceProps, RadarAlert, RadarConfig } from '../../types';

export interface RadarProps {
  alerts: RadarAlert[];
  metaInsight: string | null;
  config: RadarConfig;
  unreadCount: number;
  isScanning: boolean;
  lastScanAt: number | null;
  lastError: { code: string; message: string; retryable: boolean } | null;
  lastWarning: string | null;
  onUpdateConfig: (partial: Partial<RadarConfig>) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onForceScan: () => void;
}

export type ExtendedChatInterfaceProps = ChatInterfaceProps & {
  onDeleteMessage?: (id: string) => void;
  onOpenAdminDash?: () => void;
  radar?: RadarProps;
};

export interface ChatTheme {
  bg: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  itemHover: string;
  itemActive: string;
  btnSecondary: string;
}

export interface StartInvestigationPayload {
  companyName: string;
  cnpj: string | null;
  city: string;
  state: string;
}
