// Работа без интернета (service worker).
// При первом запуске с интернетом сохраняет в память телефона всё приложение и все истории с картинками.
// Дальше:
//   код и тексты (html, js, css, json, txt) – сначала из сети (свежая версия), без сети – из памяти;
//   картинки, звуки, видео – тоже сначала из сети (чтобы новые картинки было видно сразу), без сети – из памяти.
// Приложение при каждом запуске просит «sync»: докачать картинки новых историй, которых ещё нет в памяти.

const CACHE = 'perepiski-v2'; // v2 (23.11.2026): старая память со старыми картинками стирается при обновлении
const NET_TIMEOUT = 3000; // картинки: если сеть тянет дольше 3 секунд – показываем из памяти, а сеть обновит память в фоне
// Тексты историй и код (story.txt, js, css, json, html) при интернете ждём дольше: иначе на медленной сети
// телефон показывал старую версию серии (без новых переходов) и старый прогресс (24.11.2026)
const TEXT_TIMEOUT = 15000;
// Если сеть только что не ответила (нет интернета или он еле живой) – следующие 30 секунд сразу берём из памяти,
// чтобы приложение открывалось мгновенно, а не ждало сеть на каждом файле. Сеть при этом всё равно пробуем в фоне.
let netBadUntil = 0;
const netLooksBad = () => (self.navigator && self.navigator.onLine === false) || Date.now() < netBadUntil;

const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/chat.js', 'js/engine.js', 'js/fx.js', 'js/i18n.js', 'js/images.js', 'js/intro.js', 'js/library.js', 'js/notes.js',
  'js/parser.js', 'js/settings.js', 'js/sounds.js', 'js/storage.js', 'js/themes.js', 'js/ui.js',
  'lang/ru.js', 'vendor/powerglitch/powerglitch.esm.js',
  'fonts/playfair-cyrillic.woff2', 'fonts/playfair-latin.woff2', 'fonts/oswald-cyrillic.woff2', 'fonts/oswald-latin.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'sounds/telegram/sound_in.wav', 'sounds/telegram/sound_out.wav', 'sounds/telegram/msg_incoming.mp3',
];

const isText = (url) => url.pathname.endsWith('/') || /\.(html|js|mjs|css|json|txt)$/i.test(url.pathname);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    try { await syncStories([]); } catch (err) { /* докачаем при следующем запуске */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'sync') e.waitUntil(syncStories(e.data.skip || []).catch(() => {}));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Видео перематывается кусками (Range): такие запросы – в сеть, без сети – целиком из памяти
  if (req.headers.has('range')) {
    e.respondWith(fetch(req).catch(() => fromCache(req)));
    return;
  }
  // всё – сначала из сети (если она есть и отвечает быстро), без сети – из памяти
  e.respondWith(networkFirst(e, req));
});

async function fromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const page = await cache.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true });
    if (page) return page;
  }
  return Response.error();
}

// Сначала сеть (с проверкой свежести, чтобы не ждать 10 минут кэша GitHub), без сети – память
function networkFirst(e, req) {
  const cacheKey = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req.url;
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async (res) => {
    netBadUntil = 0;
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(cacheKey, res.clone());
    }
    return res;
  }, (err) => { netBadUntil = Date.now() + 30000; throw err; });
  e.waitUntil(net.then(() => {}, () => {}));
  const url = new URL(req.url);
  const text = req.mode === 'navigate' || isText(url);
  // для текстов не верим «сеть недавно плохая» – только явному «нет интернета»
  const bad = text ? (self.navigator && self.navigator.onLine === false) : netLooksBad();
  return new Promise((resolve) => {
    let done = false;
    const fallback = async () => {
      if (done) return;
      const cache = await caches.open(CACHE);
      const hit = await cache.match(cacheKey, { ignoreSearch: true, ignoreVary: true });
      if (hit && !done) { done = true; resolve(hit); }
      return !!hit;
    };
    const timer = setTimeout(() => { netBadUntil = Date.now() + 30000; fallback(); }, bad ? 0 : (text ? TEXT_TIMEOUT : NET_TIMEOUT));
    net.then((res) => {
      if (done) return;
      if (res.ok) { done = true; clearTimeout(timer); resolve(res); return; }
      fallback().then((ok) => { if (!ok && !done) { done = true; resolve(res); } });
    }, () => {
      clearTimeout(timer);
      fallback().then((ok) => { if (!ok && !done) { done = true; resolve(Response.error()); } });
    });
  });
}

// Сначала память, в фоне обновляем из сети; если в памяти нет – из сети и сохраняем
async function cacheFirst(e, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  const net = fetch(req).then(async (res) => {
    if (res.ok && res.status === 200) await cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(net.then(() => {}, () => {}));
    return hit;
  }
  return net.catch(() => Response.error());
}

// Докачать всё для историй: stories/index.json → каждая папка → story.txt, assets.json и все картинки из assets.json.
// Уже сохранённые картинки не качаем заново (их обновляет cacheFirst, когда они видны). skip – удалённые истории.
async function syncStories(skip) {
  const cache = await caches.open(CACHE);
  const base = self.registration.scope;
  const skipSet = new Set(skip);
  const folders = ['demo'];
  try {
    const res = await fetch(new URL('stories/index.json', base).href, { cache: 'no-cache' });
    if (res.ok) {
      await cache.put(new URL('stories/index.json', base).href, res.clone());
      for (const s of await res.json()) if (!skipSet.has(s.id)) folders.push('stories/' + s.folder);
    }
  } catch (err) { return; }
  if (skipSet.has('demo')) folders.shift();

  const files = new Set();
  for (const f of folders) {
    const dir = new URL(f + '/', base);
    for (const name of ['story.txt', 'assets.json']) {
      try {
        const u = new URL(name, dir).href;
        const r = await fetch(u, { cache: 'no-cache' });
        if (!r.ok) continue;
        await cache.put(u, r.clone());
        if (name === 'assets.json') for (const v of Object.values(await r.json())) files.add(new URL(v, dir).href);
      } catch (err) { /* дальше */ }
    }
  }
  for (const u of files) {
    if (await cache.match(u, { ignoreVary: true })) continue;
    try {
      const r = await fetch(u);
      if (r.ok && r.status === 200) await cache.put(u, r);
    } catch (err) { /* без сети – в другой раз */ }
  }
}
