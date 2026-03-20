// hooks/useRadar.ts
// Gerencia estado do Radar Competitivo & Setorial: alertas, config, auto-scan, persistência IDB.

import { useState, useEffect, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';
import type { RadarAlert, RadarConfig } from '../types';
import { DEFAULT_RADAR_CONFIG } from '../types';
import { fetchRadarAlerts } from '../services/radarService';

const IDB_ALERTS_KEY = 'scout360_radar_alerts';
const IDB_CONFIG_KEY = 'scout360_radar_config';
const IDB_LAST_SCAN_KEY = 'scout360_radar_last_scan';
const IDB_META_INSIGHT_KEY = 'scout360_radar_meta_insight';
const MAX_ALERTS = 100;

export interface UseRadarReturn {
  alerts: RadarAlert[];
  metaInsight: string | null;
  config: RadarConfig;
  unreadCount: number;
  isScanning: boolean;
  lastScanAt: number | null;
  updateConfig: (partial: Partial<RadarConfig>) => void;
  markAsRead: (alertId: string) => void;
  markAllAsRead: () => void;
  dismissAlert: (alertId: string) => void;
  forceScan: () => Promise<void>;
}

interface ToastActions {
  info: (msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
}

export function useRadar(toast?: ToastActions): UseRadarReturn {
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [metaInsight, setMetaInsight] = useState<string | null>(null);
  const [config, setConfig] = useState<RadarConfig>(DEFAULT_RADAR_CONFIG);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const scanLockRef = useRef(false);

  const unreadCount = alerts.filter(a => !a.read).length;

  // ===================================================================
  // PERSISTÊNCIA IDB
  // ===================================================================

  const persistAlerts = useCallback(async (data: RadarAlert[]) => {
    try { await set(IDB_ALERTS_KEY, data); } catch { /* IDB unavailable */ }
  }, []);

  const persistConfig = useCallback(async (data: RadarConfig) => {
    try { await set(IDB_CONFIG_KEY, data); } catch { /* IDB unavailable */ }
  }, []);

  const persistLastScan = useCallback(async (ts: number) => {
    try { await set(IDB_LAST_SCAN_KEY, ts); } catch { /* IDB unavailable */ }
  }, []);

  const persistMetaInsight = useCallback(async (insight: string | null) => {
    try { await set(IDB_META_INSIGHT_KEY, insight); } catch { /* IDB unavailable */ }
  }, []);

  // ===================================================================
  // LOAD INICIAL
  // ===================================================================

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedAlerts, savedConfig, savedLastScan, savedMetaInsight] = await Promise.all([
          get<RadarAlert[]>(IDB_ALERTS_KEY),
          get<RadarConfig>(IDB_CONFIG_KEY),
          get<number>(IDB_LAST_SCAN_KEY),
          get<string | null>(IDB_META_INSIGHT_KEY),
        ]);
        if (cancelled) return;
        if (savedAlerts) setAlerts(savedAlerts);
        if (savedConfig) setConfig(savedConfig);
        if (savedLastScan) setLastScanAt(savedLastScan);
        if (savedMetaInsight) setMetaInsight(savedMetaInsight);
      } catch {
        // IDB unavailable, use defaults
      }
      if (!cancelled) setIsInitialized(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ===================================================================
  // PERSIST ON CHANGE
  // ===================================================================

  useEffect(() => {
    if (isInitialized) persistAlerts(alerts);
  }, [alerts, isInitialized, persistAlerts]);

  useEffect(() => {
    if (isInitialized) persistConfig(config);
  }, [config, isInitialized, persistConfig]);

  // ===================================================================
  // SCAN
  // ===================================================================

  const runScan = useCallback(async () => {
    if (scanLockRef.current || !config.enabled || !config.isConfigured || config.categories.length === 0) return;
    scanLockRef.current = true;
    setIsScanning(true);
    toast?.info('Radar: varrendo notícias...');

    try {
      const { alerts: newAlerts, metaInsight: newMetaInsight } = await fetchRadarAlerts(config);
      const now = Date.now();

      setLastScanAt(now);
      persistLastScan(now);
      if (newMetaInsight) {
        setMetaInsight(newMetaInsight);
        persistMetaInsight(newMetaInsight);
      }

      setAlerts(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const fresh = newAlerts.filter(a => !existingIds.has(a.id));
        const count = fresh.length;
        
        if (count > 0) {
          toast?.success(`Radar: ${count} novo${count > 1 ? 's' : ''} alerta${count > 1 ? 's' : ''}`);
        } else {
          toast?.info('Radar: nenhuma novidade encontrada');
        }

        const merged = [...fresh, ...prev].slice(0, MAX_ALERTS);
        return merged;
      });
    } catch (err) {
      console.error('[RADAR] Scan failed:', err);
      const detail = err instanceof Error ? err.message : '';
      toast?.error(detail ? `Radar: falha na varredura (${detail})` : 'Radar: falha na varredura');
    } finally {
      setIsScanning(false);
      scanLockRef.current = false;
    }
  }, [config, persistLastScan, toast]);

  // ===================================================================
  // AUTO-SCAN (verifica intervalo)
  // ===================================================================

  useEffect(() => {
    if (!isInitialized || !config.enabled || !config.isConfigured) return;

    const intervalMs = config.scanIntervalHours * 3600_000;
    const now = Date.now();

    if (!lastScanAt || (now - lastScanAt) >= intervalMs) {
      runScan();
    }

    // Re-check a cada hora
    const timer = setInterval(() => {
      const current = Date.now();
      const lastScan = lastScanAt || 0;
      if ((current - lastScan) >= intervalMs) {
        runScan();
      }
    }, 3600_000);

    return () => clearInterval(timer);
  }, [isInitialized, config.enabled, config.scanIntervalHours, lastScanAt, runScan]);

  // ===================================================================
  // ACTIONS
  // ===================================================================

  const updateConfig = useCallback((partial: Partial<RadarConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const markAsRead = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
  }, []);

  const markAllAsRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const forceScan = useCallback(async () => {
    if (!config.isConfigured) {
      toast?.error('Configure o Radar antes de varrer (clique em ⚙️)');
      return;
    }
    await runScan();
  }, [config.isConfigured, runScan, toast]);

  return {
    alerts,
    metaInsight,
    config,
    unreadCount,
    isScanning,
    lastScanAt,
    updateConfig,
    markAsRead,
    markAllAsRead,
    dismissAlert,
    forceScan,
  };
}
