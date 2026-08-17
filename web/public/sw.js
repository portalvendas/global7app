// Service worker mínimo: torna o app instalável e serve o "shell" offline.
// Os DADOS offline (rascunhos + fila de fotos) vivem no IndexedDB, não aqui.
const CACHE = 'g7-shell-v2';
const SHELL = ['/', '/dailies', '/login', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // outra origem: não intercepta
  // NUNCA cachear a API (dados dinâmicos): projetos/empresas/dailies etc.
  // Sem isto o SW serve listas antigas (bug do "projeto sumiu").
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/docs')) return;

  if (req.mode === 'navigate') {
    // network-first para páginas; cai no cache quando offline
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/dailies'))),
    );
    return;
  }
  // assets estáticos: cache-first
  event.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  }).catch(() => r)));
});
