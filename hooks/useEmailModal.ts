import { useCallback, useEffect, useRef, useState } from 'react';
import { buildEmailSubject, sendDossierEmail } from '../services/exportService';
import { scoutDiag } from '../utils/diagnosticLog';
import type { Message } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailModalStatus = 'sending' | 'sent' | 'error' | null;

interface UseEmailModalOptions {
  messages: Message[];
  sessionTitle?: string;
  operatorName: string;
  toast: { error: (message: string) => void };
  sendEmail?: typeof sendDossierEmail;
}

export function useEmailModal({
  messages,
  sessionTitle,
  operatorName,
  toast,
  sendEmail = sendDossierEmail,
}: UseEmailModalOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailModalStatus>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
  }, [clearCloseTimer]);

  const open = useCallback(() => {
    clearCloseTimer();
    setEmailSubject(buildEmailSubject(sessionTitle));
    setEmailStatus(null);
    setIsOpen(true);
  }, [clearCloseTimer, sessionTitle]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [close, isOpen]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const handleSend = useCallback(async () => {
    if (!EMAIL_REGEX.test(emailTo.trim())) {
      toast.error('Por favor, insira um e-mail válido.');
      return;
    }
    setEmailStatus('sending');

    try {
      const success = await sendEmail({
        emailTo,
        subject: emailSubject,
        messages,
        sessionTitle,
        operatorName,
      });

      if (success) {
        setEmailStatus('sent');
        closeTimerRef.current = setTimeout(() => {
          setIsOpen(false);
          setEmailStatus(null);
          setEmailTo('');
        }, 3000);
        return;
      }

      setEmailStatus('error');
      toast.error('Falha ao enviar email. Verifique sua conexão ou o conteúdo do dossiê.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      scoutDiag.warn('Email', 'handleSendEmail falhou', { error: message });
      setEmailStatus('error');
      toast.error('Falha ao enviar email. Verifique sua conexão.');
    }
  }, [emailSubject, emailTo, messages, operatorName, sendEmail, sessionTitle, toast]);

  return {
    isOpen,
    emailTo,
    setEmailTo,
    emailSubject,
    setEmailSubject,
    emailStatus,
    open,
    close,
    handleSend,
  };
}
