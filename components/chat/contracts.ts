import type { ChatInterfaceProps } from '../../types';

export type ExtendedChatInterfaceProps = ChatInterfaceProps & {
  onDeleteMessage?: (id: string) => void;
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
