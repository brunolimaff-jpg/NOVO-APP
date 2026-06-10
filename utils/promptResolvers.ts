import type { RadarAlert } from '../types';
import type { ExtendedChatInterfaceProps, StartInvestigationPayload } from '../components/chat/contracts';

type PromptMode = 'standard' | 'executive' | 'ultraDepth' | 'warMode';

export function resolvePromptMode(appMode: unknown, canWarRoom?: boolean): PromptMode {
  const raw = String(appMode || '').toLowerCase();

  if (raw.includes('war')) return 'warMode';
  if (raw.includes('ultra')) return 'ultraDepth';
  if (raw.includes('deep')) return 'ultraDepth';
  if (raw.includes('exec')) return 'executive';
  if (canWarRoom) return 'executive';
  return 'executive';
}

export function shouldIncludeBudgetPrompt(
  payload: StartInvestigationPayload,
  promptMode: PromptMode,
  radar?: ExtendedChatInterfaceProps['radar'],
): boolean {
  if (promptMode === 'warMode') return true;
  if (promptMode === 'ultraDepth') return true;
  if (payload.cnpj) return true;
  if (radar?.metaInsight) return true;
  if ((radar?.alerts?.length || 0) > 0) return true;
  return false;
}

export function buildRadarContextBlock(radar?: ExtendedChatInterfaceProps['radar']): string {
  if (!radar) return '';

  const topAlerts = (radar.alerts || []).slice(0, 3).map((alert: RadarAlert, index) => {
    const title = alert.title?.trim() || `Alerta ${index + 1}`;
    const detail = alert.summary?.trim() || 'Sem detalhe adicional';
    return `- ${title}: ${detail}`;
  });

  return [
    '<radar_context>',
    `RadarConfigured=${radar.config?.isConfigured ? 'SIM' : 'NAO'}`,
    `RadarUnreadCount=${radar.unreadCount ?? 0}`,
    `RadarIsScanning=${radar.isScanning ? 'SIM' : 'NAO'}`,
    `RadarMetaInsight=${radar.metaInsight || 'N/D'}`,
    `RadarLastWarning=${radar.lastWarning || 'N/D'}`,
    `RadarLastError=${radar.lastError ? `${radar.lastError.code}: ${radar.lastError.message}` : 'N/D'}`,
    topAlerts.length ? 'TopRadarAlerts:' : 'TopRadarAlerts: N/D',
    ...(topAlerts.length ? topAlerts : []),
    '</radar_context>',
  ].join('\n');
}
