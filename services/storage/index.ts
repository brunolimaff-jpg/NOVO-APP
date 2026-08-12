// services/storage/index.ts
// Barrel re-export — mantém compatibilidade com todos os consumidores.
export { prepareDossierForPersistence } from './dossiers';
// Antes: import { storage } from '../services/storage'
// Depois: import { storage } from '../services/storage' (mesmo import, barrel resolve)

import { dossiers } from './dossiers';
import { extractCache } from './extractCache';
import { userContext } from './userContext';
import { radar } from './radar';

export const storage = {
  ...dossiers,
  ...extractCache,
  ...userContext,
  ...radar,
};
