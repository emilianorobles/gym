// Estrategia: cache primero, actualización en segundo plano (stale-while-revalidate).
// El gym tiene señal mala: la app debe abrir al instante desde cache aunque no haya red.
// Un cambio en index.html o plan-emi.json aparece en la SIGUIENTE carga, no en la actual.
const CACHE = 'rutina-v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './plan-emi.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cacheado => {
      const red = fetch(e.request).then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => cacheado);
      return cacheado || red;
    })
  );
});
