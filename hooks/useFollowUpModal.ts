import { useCallback, useEffect, useRef, useState } from 'react';
import type { FollowUpScheduleResult } from '../components/FollowUpModal';

export type FollowUpModalStatus = 'idle' | 'sending' | 'sent' | 'error';

interface UseFollowUpModalOptions {
  toast: { error: (message: string) => void };
}

export function useFollowUpModal({ toast }: UseFollowUpModalOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [followUpDias, setFollowUpDias] = useState(7);
  const [followUpNotas, setFollowUpNotas] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpModalStatus>('idle');
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
    setFollowUpStatus('idle');
    setIsOpen(true);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [close, isOpen]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const handleSchedule = useCallback(
    (result: FollowUpScheduleResult) => {
      setFollowUpStatus('sending');
      if (result.ok) {
        setFollowUpStatus('sent');
        closeTimerRef.current = setTimeout(() => {
          setIsOpen(false);
          setFollowUpStatus('idle');
          setFollowUpNotas('');
        }, 2200);
        return;
      }

      setFollowUpStatus('error');
      toast.error(result.error || 'Não foi possível preparar o follow-up.');
    },
    [toast],
  );

  return {
    isOpen,
    emailTo,
    setEmailTo,
    followUpDias,
    setFollowUpDias,
    followUpNotas,
    setFollowUpNotas,
    followUpStatus,
    open,
    close,
    handleSchedule,
  };
}
