// Lucky Food Navigator Service Worker
const CACHE = 'lfn-v3';
const SHELL = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png',
  // フロアマップもプリキャッシュする。画像が loading="lazy" かつ display:none なので、
  // 「マップを一度も開かずにオフラインへ」という流れでもマップを表示できるようにする。
  './map_1f.webp', './map_2f.webp'
];
// HTML をネットから待つ上限。モール内の弱い電波で真っ白な画面のまま待たされないよう、
// これを超えたらキャッシュを先に表示する（取得は続けて、次回用にキャッシュを更新する）。
const NAV_TIMEOUT_MS = 3000;

// キャッシュに入れてよい応答か判定する。
// 404/500 やレンジ応答(206)を保存すると、オンラインに戻ってもエラーを配り続けてしまう。
function isCacheable(res) {
  return res && res.ok && res.status === 200 &&
         (res.type === 'basic' || res.type === 'cors' || res.type === 'default');
}

// ネットから取得し、成功したらキャッシュも更新する。
// [応答のPromise, キャッシュ更新まで含めて終わるPromise] を返す。
// 後者は e.waitUntil に同期的に渡す（非同期に後から呼ぶと InvalidStateError になる）。
// 本文を読まれる前に clone しておかないと、キャッシュ保存時に「使用済みの本文」で失敗する。
function fetchAndCache(req) {
  let saved = null;
  const res = fetch(req).then(r => {
    if (isCacheable(r)) {
      const copy = r.clone();
      saved = caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return r;
  });
  const settled = res.then(() => saved, () => null);
  return [res, settled];
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

  // HTML: ネット優先（更新を即反映）。ただし NAV_TIMEOUT_MS を超えたらキャッシュで先に表示する
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    const [network, settled] = fetchAndCache(req);
    e.waitUntil(settled);
    const fromCache = () => caches.match(req).then(r => r || caches.match('./index.html'));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done && r) { done = true; resolve(r); } };
      const timer = setTimeout(() => fromCache().then(finish), NAV_TIMEOUT_MS);
      network.then(r => { clearTimeout(timer); finish(r); })
             .catch(() => { clearTimeout(timer); fromCache().then(r => finish(r || Response.error())); });
    }));
    return;
  }

  // 同一オリジン資産: キャッシュを即返しつつ裏で取り直す（stale-while-revalidate）。
  // 旧実装はキャッシュ優先のままで、アイコンやマップ画像を差し替えても CACHE 名を上げない限り反映されなかった。
  if (url.origin === location.origin) {
    const [network, settled] = fetchAndCache(req);
    e.waitUntil(settled);
    e.respondWith(caches.match(req).then(cached => {
      if (cached) { network.catch(() => {}); return cached; }
      return network;
    }));
    return;
  }

  // 外部（Googleフォント等）: 中身が変わらないのでキャッシュ優先。無いときだけ取得して保存する
  let saveDone = Promise.resolve();
  const result = caches.match(req).then(cached => {
    if (cached) return cached;
    const [network, settled] = fetchAndCache(req);
    saveDone = settled;
    return network;
  });
  e.respondWith(result);
  // 保存が終わるまで SW を生かしておく（waitUntil は同期的に登録する）
  e.waitUntil(result.then(() => saveDone, () => null));
});
