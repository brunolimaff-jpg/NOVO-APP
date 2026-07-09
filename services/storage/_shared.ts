// services/storage/_shared.ts
// Helpers compartilhados entre módulos de storage.

import { storageGet } from '../../utils/localStorage';

let authenticatedOperatorId: string | null = null;

export function setAuthenticatedOperatorId(operatorId: string | null): void {
  const normalizedOperatorId = operatorId?.trim() || null;
  authenticatedOperatorId = normalizedOperatorId;
}

export function getAuthenticatedOperatorId(): string | null {
  return authenticatedOperatorId;
}

export function getOperatorId(): string | null {
  return authenticatedOperatorId ?? storageGet('operator_id');
}
