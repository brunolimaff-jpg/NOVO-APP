// services/storage/_shared.ts
// Helpers compartilhados entre módulos de storage.

import { storageGet } from '../../utils/localStorage';

export function getOperatorId(): string | null {
  return storageGet('operator_id');
}
