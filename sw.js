// Lucky Food Navigator Service Worker
const CACHE = 'lfn-v1';
const SHELL = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // HTMLはネット優先（更新を即反映、オフライン時はキャッシュ）
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // 同一オリジン資産はキャッシュ優先
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(rr => { const cp = rr.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return rr; }))
    );
    return;
  }
  // 外部（Googleフォント等）はランタイムキャッシュ
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(rr => { const cp = rr.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return rr; }).catch(() => cached))
  );
});
