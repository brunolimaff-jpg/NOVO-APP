/**
 * ConfirmPopover — substitui window.confirm() por confirmação inline.
 *
 * Uso com render prop:
 *   <ConfirmPopover message="Excluir?" onConfirm={handleDelete} isDarkMode={isDarkMode}>
 *     {({ onClick }) => <button onClick={onClick}>🗑️</button>}
 *   </ConfirmPopover>
 */
import React, { useState } from 'react';

interface ConfirmPopoverProps {
  onConfirm: () => void | Promise<void>;
  message: string;
  isDarkMode?: boolean;
  children: (triggerProps: { onClick: (e?: React.MouseEvent) => void }) => React.ReactNode;
}

const ConfirmPopover: React.FC<ConfirmPopoverProps> = ({ onConfirm, message, isDarkMode = false, children }) => {
  const [confirming, setConfirming] = useState(false);

  const trigger = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirming(true);
  };

  const cancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(false);
  };

  const confirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(false);
    await onConfirm();
  };

  if (confirming) {
    return (
      <div
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 border text-xs animate-fade-in ${
          isDarkMode ? 'bg-slate-800 border-red-500/40' : 'bg-red-50 border-red-200'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <span className={`font-medium truncate max-w-[120px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          {message}
        </span>
        <button
          onClick={confirm}
          className="ml-1 px-1.5 py-0.5 rounded bg-red-500 text-white font-bold text-[11px] hover:bg-red-600 transition-colors flex-shrink-0"
        >
          Sim
        </button>
        <button
          onClick={cancel}
          className={`px-1.5 py-0.5 rounded text-[11px] flex-shrink-0 transition-colors ${
            isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          Não
        </button>
      </div>
    );
  }

  return <>{children({ onClick: trigger })}</>;
};

export default ConfirmPopover;
