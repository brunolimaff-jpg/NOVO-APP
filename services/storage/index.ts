// services/storage/index.ts
// Barrel re-export — mantém compatibilidade com todos os consumidores.
// Antes: import { storage } from '../services/storage'
// Depois: import { storage } from '../services/storage' (mesmo import, barrel resolve)

import { dossiers } from './dossiers';
import { extractCache } from './extractCache';
import { userContext } from './userContext';
import { audit } from './audit';
import { favorites } from './favorites';
import { radar } from './radar';
import { sharedDossiers } from './sharedDossiers';

export const storage = {
  ...dossiers,
  ...extractCache,
  ...userContext,
  ...audit,
  ...favorites,
  ...radar,
  ...sharedDossiers,
};
