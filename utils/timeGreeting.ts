/**
 * Retorna a saudação adequada ao horário atual do dispositivo.
 * - 0h–5h  → "Boa madrugada"
 * - 6h–11h → "Bom dia"
 * - 12h–17h → "Boa tarde"
 * - 18h–23h → "Boa noite"
 */
export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}
