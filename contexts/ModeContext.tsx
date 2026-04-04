
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatMode, DEFAULT_MODE } from '../constants';
// FIX: namespace import adia a resolução dos bindings para o runtime do provider,
// prevenindo Temporal Dead Zone (TDZ) no bundle minificado de produção.
// Importação named direta de OPERACAO_PROMPT / DIRETORIA_PROMPT causava
// "Cannot access 'Sn' before initialization" quando o React Compiler
// reescrevia os closures alterando a ordem de avaliação dos módulos.
import * as Constants from '../constants';

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
    // MVP: diretoria desativado temporariamente. Força operação.
    setModeState(ENFORCED_MODE);
    try {
      localStorage.setItem('scout360_mode', ENFORCED_MODE);
    } catch {
      // localStorage indisponível em alguns contextos (Safari private, iframe) — ignora silenciosamente
      console.warn('[ModeProvider] localStorage indisponível, modo não persiste entre sessões.');
    }
  }, []);

  const setMode = (_newMode: ChatMode) => {
    setModeState(ENFORCED_MODE);
    try {
      localStorage.setItem('scout360_mode', ENFORCED_MODE);
    } catch {
      console.warn('[ModeProvider] localStorage indisponível.');
    }
  };

  const toggleMode = () => {
    setMode(ENFORCED_MODE);
  };

  // FIX: acesso via namespace — resolvido no runtime do provider, não no init do módulo
  const systemInstruction =
    mode === 'operacao' ? Constants.OPERACAO_PROMPT : Constants.DIRETORIA_PROMPT;

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
