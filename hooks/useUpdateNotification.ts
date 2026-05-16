import { useState, useEffect, useCallback } from 'react';
import { scoutDiag } from '../utils/diagnosticLog';

interface VersionInfo {
  version: string;
  timestamp: string;
}

const STORAGE_KEY_LAST_CHECK = 'update_last_check_timestamp';
const STORAGE_KEY_SNOOZE = 'update_snooze_until';
const STORAGE_KEY_CURRENT_VERSION = 'current_app_version';
const CHECK_INTERVAL_DAYS = 3;
const SNOOZE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hora

export interface UpdateAvailableEvent {
  currentVersion: string;
  newVersion: string;
  timestamp: string;
}

export function useUpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<number | null>(null);

  // Dismissar notificação (por snooze de 1h)
  const dismissUpdate = useCallback(() => {
    const snoozeUntil = Date.now() + SNOOZE_DURATION_MS;
    localStorage.setItem(STORAGE_KEY_SNOOZE, snoozeUntil.toString());
    setUpdateAvailable(false);
  }, []);

  // Atualizar agora (limpar cache + reload)
  const updateNow = useCallback(async () => {
    try {
      // Deletar todos os caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // Limpar service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      registrations.forEach(reg => reg.unregister());

      // Recarregar página
      window.location.reload();
    } catch (error) {
      console.error('Erro ao atualizar app:', error);
      // Fallback: apenas recarregar
      window.location.reload();
    }
  }, []);

  // Verificar se devemos fazer check (3 dias passaram)
  const shouldCheck = useCallback((): boolean => {
    const lastCheck = localStorage.getItem(STORAGE_KEY_LAST_CHECK);
    if (!lastCheck) return true; // Nunca checou, fazer agora

    const lastCheckMs = parseInt(lastCheck, 10);
    const now = Date.now();
    const daysSinceCheck = (now - lastCheckMs) / (1000 * 60 * 60 * 24);

    return daysSinceCheck >= CHECK_INTERVAL_DAYS;
  }, []);

  // Verificar se snooze ainda está ativo
  const isSnoozed = useCallback((): boolean => {
    const snoozeUntil = localStorage.getItem(STORAGE_KEY_SNOOZE);
    if (!snoozeUntil) return false;

    const snoozeUntilMs = parseInt(snoozeUntil, 10);
    return Date.now() < snoozeUntilMs;
  }, []);

  // Verificar versão no servidor
  const checkForUpdates = useCallback(async () => {
    if (!shouldCheck() || isSnoozed()) return;

    try {
      setIsChecking(true);

      // Fetch version.json do servidor
      const response = await fetch('/version.json', {
        cache: 'no-store',
        headers: { 'pragma': 'no-cache' }
      });

      if (!response.ok) return;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;

      const versionData: VersionInfo = await response.json();
      const storedVersion = localStorage.getItem(STORAGE_KEY_CURRENT_VERSION) || versionData.version;

      setCurrentVersion(storedVersion);
      setLastCheckTime(Date.now());

      // Comparar versões (simples: usar string compare, assumindo versionamento semver)
      if (isNewerVersion(versionData.version, storedVersion)) {
        setNewVersion(versionData.version);
        setUpdateAvailable(true);

        // Disparar evento customizado para possível notificação em Toast
        const event = new CustomEvent('updateAvailable', {
          detail: {
            currentVersion: storedVersion,
            newVersion: versionData.version,
            timestamp: versionData.timestamp,
          } as UpdateAvailableEvent,
        });
        window.dispatchEvent(event);
      }

      // Armazenar timestamp do check
      localStorage.setItem(STORAGE_KEY_LAST_CHECK, Date.now().toString());
    } catch (error) {
      scoutDiag.warn('UpdateCheck', 'Falha ao verificar atualizações', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continuar silenciosamente se falhar
    } finally {
      setIsChecking(false);
    }
  }, [shouldCheck, isSnoozed]);

  // Executar check no mount
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Sincronizar entre abas via StorageEvent
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_SNOOZE) {
        // Se snooze mudou em outra aba, verificar status
        setUpdateAvailable(!isSnoozed());
      }
      if (e.key === STORAGE_KEY_CURRENT_VERSION) {
        // Se versão atual mudou, resetar notificação
        setUpdateAvailable(false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isSnoozed]);

  return {
    updateAvailable,
    currentVersion,
    newVersion,
    isChecking,
    lastCheckTime,
    dismissUpdate,
    updateNow,
    checkForUpdates,
  };
}

/**
 * Comparar versões (simples)
 * Assume formato: "4.7", "4.8", etc ou "Investigação Completa v4.7"
 */
function isNewerVersion(newVer: string, currentVer: string): boolean {
  // Extrair números da versão
  const newMatch = newVer.match(/v?(\d+)\.(\d+)/);
  const currentMatch = currentVer.match(/v?(\d+)\.(\d+)/);

  if (!newMatch || !currentMatch) return false;

  const [, newMajor, newMinor] = newMatch;
  const [, currentMajor, currentMinor] = currentMatch;

  const newMajorNum = parseInt(newMajor, 10);
  const newMinorNum = parseInt(newMinor, 10);
  const currentMajorNum = parseInt(currentMajor, 10);
  const currentMinorNum = parseInt(currentMinor, 10);

  if (newMajorNum > currentMajorNum) return true;
  if (newMajorNum === currentMajorNum && newMinorNum > currentMinorNum) return true;

  return false;
}
