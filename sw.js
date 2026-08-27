// Lucky Food Navigator Service Worker
const CACHE = 'lfn-v2';
const SHELL = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png',
  // フロアマップもプリキャッシュする。旧実装では対象外だったうえ、
  // 画像が loading="lazy" かつ display:none なので「マップを一度も開かずにオフラインへ」
  // という一番ありがちな流れでマップが表示できなかった。
  './map_1f.webp', './map_2f.webp'
];

// キャッシュに入れてよい応答か判定する。
// 旧実装は判定なしで put していたため、404/500 やレンジ応答(206)まで保存され、
// 一度失敗するとオンラインに戻ってもエラーを配り続けることがあった。
function isCacheable(res) {
  return res && res.ok && res.status === 200 &&
         (res.type === 'basic' || res.type === 'cors' || res.type === 'default');
}
function putIfOk(req, res) {
  if (!isCacheable(res)) return;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll は1件でも失敗すると全体が落ちるので個別に入れる
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // HTMLはネット優先（更新を即反映、オフライン時はキャッシュ）
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then(r => { putIfOk(req, r); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 同一オリジン資産はキャッシュ優先
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(rr => { putIfOk(req, rr); return rr; }))
    );
    return;
  }

  // 外部（Googleフォント等）はランタイムキャッシュ
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(rr => { putIfOk(req, rr); return rr; }).catch(() => cached)
    )
  );
});
