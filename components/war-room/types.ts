import type { WarRoomMode } from '../../services/warRoomService';
import type { LinkValidationResult } from '../../utils/linkValidation';

export interface WarRoomProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  defaultCompetitorTarget?: string | null;
}

export interface WRMessage {
  id: string;
  role: 'user' | 'model';
  mode: WarRoomMode;
  text: string;
  sources?: Array<{ title: string; url: string }>;
  isLoading?: boolean;
  isError?: boolean;
  retryable?: boolean;
  technicalDetails?: string;
}

export type UnifiedRoute = 'tech' | 'benchmark';

export type AccentName = 'blue' | 'red' | 'amber' | 'purple';

export type ModeConfig = {
  icon: string;
  label: string;
  subtitle: string;
  accent: AccentName;
  placeholder: string;
};

export type LinkStatusMap = Record<string, LinkValidationResult>;
