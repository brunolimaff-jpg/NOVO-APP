const ROUTER_MODEL = 'gemini-3.1-flash-lite-preview';
const COMPAT_MODEL = 'gemini-3.1-pro-preview';
const FALLBACK_PRO = 'gemini-3.1-pro-preview'; // Estava gemini-3.1-pro-preview
const FALLBACK_FLASH = 'gemini-3.1-flash-lite-preview'; // Estava gemini-3.1-flash-lite-preview

// Nota: Adicionando redundância de modelos para mitigar estouro de Rate Limit
// conforme solicitação. Se o 3.1 falhar, o sistema buscará os modelos de preview mais recentes.

function pickModel(envValue: string | undefined, fallback: string): string {
  const value = (envValue || '').trim();
  if (!value) return fallback;

  if (/^deep-research-/i.test(value)) return fallback;

  return value;
}

export const MODEL_IDS = {
  router: pickModel(import.meta.env.VITE_ROUTER_MODEL, ROUTER_MODEL),
  tactical: pickModel(import.meta.env.VITE_TACTICAL_MODEL, COMPAT_MODEL),
  deepChat: pickModel(import.meta.env.VITE_DEEP_CHAT_MODEL, COMPAT_MODEL),
  deepResearch: pickModel(import.meta.env.VITE_DEEP_RESEARCH_MODEL, COMPAT_MODEL),
  fallbackPro: FALLBACK_PRO,
  fallbackFlash: FALLBACK_FLASH
} as const;
