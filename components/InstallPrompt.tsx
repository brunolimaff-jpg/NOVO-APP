import React from 'react';
import { usePWA } from '../hooks/usePWA';

export default function InstallPrompt() {
  const { showInstallPrompt, installApp, dismissInstallPrompt } = usePWA();

  if (!showInstallPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-slide-up">
      <div className="bg-gradient-to-br from-red-600 to-red-700 text-white rounded-2xl shadow-2xl p-4 border border-red-500/30">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📱</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm mb-1">Instalar 🦅 Senior Scout 360</h3>
            <p className="text-xs opacity-90 mb-3">Acesso rápido direto da tela inicial</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  void installApp();
                }}
                className="flex-1 bg-white text-red-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors"
              >
                Instalar
              </button>
              <button
                onClick={dismissInstallPrompt}
                className="px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
