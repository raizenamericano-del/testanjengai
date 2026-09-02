/* NEURAL AI STUDIO — service worker.
   Strategy: app-shell precache (network-first, fall back to cache) + runtime cache-first for the
   CDN libs that tools load lazily, + NEVER cache provider API calls (keys + user prompts). */
const VER = 'nas-v1.0.0';
const SHELL = [
  './', 'index.html', 'chat.html', 'image.html', 'photo.html', 'media.html',
  'convert.html', 'tools.html', 'scrape.html', 'account.html', 'admin.html', 'r.html', 'manifest.webmanifest',
  'assets/css/app.css', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/favicon.ico',
  'assets/js/lib/config.js', 'assets/js/lib/ui.js', 'assets/js/lib/store.js',
  'assets/js/lib/auth.js', 'assets/js/lib/ai.js', 'assets/js/lib/img.js',
  'assets/js/lib/tools.js', 'assets/js/lib/links.js',
  'assets/js/app-home.js', 'assets/js/app-chat.js', 'assets/js/app-image.js',
  'assets/js/app-media.js', 'assets/js/app-tools.js', 'assets/js/app-scrape.js',
  'assets/js/app-account.js', 'assets/js/app-admin.js',
  'assets/js/app-photo.js', 'assets/js/app-convert.js', 'secrets.example.js'
];
const CDN_HOSTS = ['cdn.jsdelivr.net'];
const NEVER = [/api\.groq\.com/, /generativelanguage\.googleapis\.com/, /integrate\.api\.nvidia\.com/, /\/api\//];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then(async (c) => {
    for (const u of SHELL) { try { await c.add(new Request(u, { cache: 'reload' })); } catch (err) { /* optional page */ } }
    return self.skipWaiting();
  }));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NEVER.some(re => re.test(url.href))) return;                      // never cache prompts/keys/responses
  if (url.origin === self.location.origin && url.pathname.endsWith('.html')) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('index.html'))));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => { const c = res.clone(); caches.open(VER).then(x => x.put(req, c)); return res; })));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {                                // stale-while-revalidate for libs
    e.respondWith(caches.match(req).then(m => {
      const refresh = fetch(req).then(res => { const c = res.clone(); caches.open(VER).then(x => x.put(req, c)); return res; }).catch(() => m);
      return m || refresh;
    }));
  }
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
