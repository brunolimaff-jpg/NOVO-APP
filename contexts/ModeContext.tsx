import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatMode, DEFAULT_MODE } from '../constants';
import { OPERACAO_PROMPT } from '../prompts/systemPrompts';

interface ModeContextType {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
  toggleMode: () => void;
  systemInstruction: string;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export const ModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ChatMode>(DEFAULT_MODE);
  const ENFORCED_MODE: ChatMode = 'operacao';

  useEffect(() => {
    // Modo diretoria descontinuado. Forca operacao permanentemente.
    setModeState(ENFORCED_MODE);
    try {
      localStorage.setItem('scout360_mode', ENFORCED_MODE);
    } catch {
      console.warn('[ModeProvider] localStorage indisponivel, modo nao persiste entre sessoes.');
    }
  }, []);

  const setMode = (_newMode: ChatMode) => {
    setModeState(ENFORCED_MODE);
    try {
      localStorage.setItem('scout360_mode', ENFORCED_MODE);
    } catch {
      console.warn('[ModeProvider] localStorage indisponivel.');
    }
  };

  const toggleMode = () => {
    setMode(ENFORCED_MODE);
  };

  // Modo unico: operacao. DIRETORIA_PROMPT removido.
  const systemInstruction = OPERACAO_PROMPT;

  return (
    <ModeContext.Provider value={{ mode, setMode, toggleMode, systemInstruction }}>
      {children}
    </ModeContext.Provider>
  );
};

export const useMode = () => {
  const context = useContext(ModeContext);
  if (context === undefined) {
    throw new Error('useMode deve ser usado dentro de um ModeProvider');
  }
  return context;
};
