const UI_ERROR_AUDIT_KEY = 'scout360_ui_errors_v1';

export function generateUiErrorId(message: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const prefix = message.replace(/[^a-zA-Z$_]/g, '').slice(0, 6).toUpperCase();
  return `ERR-${prefix}-${timestamp}`;
}

export function buildUiErrorReport(errorId: string, error: Error, componentStack = ''): string {
  return [
    `[${errorId}] ${new Date().toISOString()}`,
    `Mensagem: ${error.message}`,
    `Stack JS:\n${error.stack ?? 'indisponivel'}`,
    `Stack React:\n${componentStack || 'indisponivel'}`,
  ].join('\n\n');
}

export function persistUiErrorAudit(errorId: string, error: Error, componentStack = '') {
  try {
    const raw = localStorage.getItem(UI_ERROR_AUDIT_KEY);
    const entries: unknown[] = raw ? JSON.parse(raw) : [];
    entries.push({
      id: errorId,
      ts: new Date().toISOString(),
      level: 'error',
      reason: error.message,
      stack: error.stack ?? '',
      componentStack,
    });
    localStorage.setItem(UI_ERROR_AUDIT_KEY, JSON.stringify(entries.slice(-50)));
  } catch (storageError) {
    console.warn('[ErrorBoundary] localStorage indisponivel:', storageError);
  }
}
