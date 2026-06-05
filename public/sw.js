// Kill-switch: Service Worker temporário para limpar cache antigo (PR #334)
// O SW anterior usava CacheFirst e servia bundles obsoletos após deploys.
// Este SW remove todos os caches, desregistra a si mesmo, e libera os clients.
// Manter por 1-2 releases até produção estabilizar, depois remover este arquivo.

self.addEventListener('install', () => {
  // Toma controle imediatamente, sem esperar o SW antigo terminar
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // 1. Força controle sobre todos os clients
      await self.clients.claim();

      // 2. Remove TODOS os caches conhecidos
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // 3. Desregistra este SW para que não persista
      await self.registration.unregister();

      // 4. Notifica todos os clients abertos para recarregar
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'SW_KILLSWITCH', action: 'reload' });
        // Tenta forçar navegação do client para a versão mais recente
        if ('navigate' in client) {
          client.navigate(client.url);
        }
      }
    })(),
  );
});

// Pass-through: nunca cachear, sempre ir direto na rede
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
