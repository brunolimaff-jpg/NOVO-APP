import React from 'react';

interface EmailModalProps {
  emailTo: string;
  onEmailToChange: (value: string) => void;
  emailSubject: string;
  onEmailSubjectChange: (value: string) => void;
  emailStatus: 'sending' | 'sent' | 'error' | null;
  onSend: () => void;
  onClose: () => void;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  emailTo,
  onEmailToChange,
  emailSubject,
  onEmailSubjectChange,
  emailStatus,
  onSend,
  onClose,
}) => (
  <>
    <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4 pointer-events-none">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-xl pointer-events-auto">
        <h3 className="text-lg font-bold text-white mb-4">📧 Enviar Dossiê por Email</h3>
        <div className="space-y-3 mb-4">
          <input
            type="email"
            value={emailTo}
            onChange={e => onEmailToChange(e.target.value)}
            placeholder="Email do destinatário"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
            autoFocus
          />
          <input
            type="text"
            value={emailSubject}
            onChange={e => onEmailSubjectChange(e.target.value)}
            placeholder="Assunto"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        {emailStatus && (
          <div className="text-sm mb-4 p-2 rounded-lg text-emerald-400 bg-emerald-500/10">
            {emailStatus === 'sending' && '⏳ Enviando...'}
            {emailStatus === 'sent' && '✅ Enviado!'}
            {emailStatus === 'error' && '❌ Erro ao enviar.'}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onSend}
            disabled={emailStatus === 'sending' || !emailTo.includes('@')}
            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-sm"
          >
            {emailStatus === 'sending' ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  </>
);
