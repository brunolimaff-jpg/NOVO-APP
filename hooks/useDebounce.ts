import { useEffect, useState } from 'react';

/**
 * Hook que retorna um valor defasado (debounced) depois de `delay` ms.
 * Ideal para inputs de busca que disparam filtros ou chamadas API.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
