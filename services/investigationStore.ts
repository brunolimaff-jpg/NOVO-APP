// services/investigationStore.ts
// Store global pub/sub para investigações — sem localStorage, apenas memória de sessão.
// Extraído de InvestigationDashboard.tsx para romper a dependência cruzada
// service → component que causava TDZ ("Cannot access 'An' before initialization") em produção.

export interface Investigation {
  id: string;
  empresa: string;
  score: number;
  scoreLabel: string;
  gaps: string[];
  familias: string[];
  isCliente: boolean;
  modo: string;
  data: string;
  resumo: string;
}

let investigationsStore: Investigation[] = [];
let listeners: Array<() => void> = [];

function notifyListeners(): void {
  listeners.forEach(fn => fn());
}

export function addInvestigation(inv: Investigation): void {
  const idx = investigationsStore.findIndex(i => i.empresa.toUpperCase() === inv.empresa.toUpperCase());
  if (idx >= 0) {
    investigationsStore[idx] = { ...inv, id: investigationsStore[idx].id };
  } else {
    investigationsStore = [inv, ...investigationsStore];
  }
  notifyListeners();
}

export function getInvestigations(): Investigation[] {
  return [...investigationsStore];
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}
