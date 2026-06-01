// services/storage/_shared.ts
// Helpers compartilhados entre módulos de storage.

export function getOperatorId(): string | null {
  return localStorage.getItem('scout360:operator_id');
}
