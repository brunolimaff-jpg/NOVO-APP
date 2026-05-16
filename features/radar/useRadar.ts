// features/radar/useRadar.ts
// Gerencia estado do Radar Competitivo & Setorial: alertas, config, auto-scan, persistência IDB.

import { useState, useEffect, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';
import type { RadarAlert, RadarConfig } from './types';
import { DEFAULT_RADAR_CONFIG } from './types';
import { fetchRadarAlerts, type RadarScanError, type RadarScanErrorCode } from './service';
import { scoutDiag } from '../../utils/diagnosticLog';

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
  lastError: { code: RadarScanErrorCode; message: string; retryable: boolean } | null;
  lastWarning: string | null;
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

// ===================================================================
// DEDUP SEMÂNTICO — Jaccard de bigramas (threshold 0.55)
// Detecta o mesmo artigo reescrito pelo Gemini entre varreduras.
// ===================================================================

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/[^a-z0-9\s]/g, '')       // remove pontuação
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str: string): Set<string> {
  const s = normTitle(str);
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

function jaccardSimilarity(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  ba.forEach(g => { if (bb.has(g)) intersection++; });
  return intersection / (ba.size + bb.size - intersection);
}

const DEDUP_THRESHOLD = 0.55;

function isDuplicate(candidate: RadarAlert, existing: RadarAlert[]): boolean {
  // Exact ID match — fast path
  if (existing.some(a => a.id === candidate.id)) return true;
  // Semantic match via Jaccard bigramas
  return existing.some(a => jaccardSimilarity(candidate.title, a.title) >= DEDUP_THRESHOLD);
}

// ===================================================================

export function useRadar(toast?: ToastActions): UseRadarReturn {
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [metaInsight, setMetaInsight] = useState<string | null>(null);
  const [config, setConfig] = useState<RadarConfig>(DEFAULT_RADAR_CONFIG);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<{ code: RadarScanErrorCode; message: string; retryable: boolean } | null>(
    null,
  );
  const [lastWarning, setLastWarning] = useState<string | null>(null);
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
    if (scanLockRef.current || !config.isConfigured || config.categories.length === 0) return;
    scanLockRef.current = true;
    setIsScanning(true);
    setLastError(null);
    setLastWarning(null);
    toast?.info('Radar: varrendo notícias...');

    try {
      const { alerts: newAlerts, metaInsight: newMetaInsight, partialFailures } = await fetchRadarAlerts(config);
      const now = Date.now();

      setLastScanAt(now);
      persistLastScan(now);
      if (newMetaInsight) {
        setMetaInsight(newMetaInsight);
        persistMetaInsight(newMetaInsight);
      }

      setAlerts(prev => {
        // Dedup semântico: filtra alertas novos que já existem no histórico
        // por ID exato OU por similaridade de título >= DEDUP_THRESHOLD
        const fresh = newAlerts.filter(a => !isDuplicate(a, prev));
        const count = fresh.length;

        const hasPartialFailures = partialFailures.length > 0;
        if (hasPartialFailures) {
          const failedCategories = partialFailures.map(f => f.category).join(', ');
          const warningMessage = count > 0
            ? `Varredura parcial: alguns temas falharam (${failedCategories}).`
            : `Não foi possível varrer alguns temas (${failedCategories}).`;
          setLastWarning(warningMessage);
          toast?.info(`Radar: varredura parcial (${failedCategories})`);
        } else if (count > 0) {
          toast?.success(`Radar: ${count} novo${count > 1 ? 's' : ''} alerta${count > 1 ? 's' : ''}`);
        } else {
          toast?.info('Radar: nenhuma novidade encontrada');
        }

        const merged = [...fresh, ...prev].slice(0, MAX_ALERTS);
        return merged;
      });
    } catch (err) {
      scoutDiag.error('Radar', 'falha na varredura', { error: err });
      const scanError = err as RadarScanError;
      const userMessage = scanError?.userMessage || 'Falha na varredura do Radar.';
      const code = scanError?.code || 'RADAR_UNKNOWN';
      const retryable = typeof scanError?.retryable === 'boolean' ? scanError.retryable : true;
      setLastError({ code, message: userMessage, retryable });
      toast?.error(`Radar: ${userMessage}`);
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
      setLastError({
        code: 'RADAR_BAD_REQUEST',
        message: 'Configure o Radar antes de iniciar a varredura.',
        retryable: false,
      });
      toast?.error('Configure o Radar antes de iniciar a varredura.');
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
    lastError,
    lastWarning,
    updateConfig,
    markAsRead,
    markAllAsRead,
    dismissAlert,
    forceScan,
  };
}
