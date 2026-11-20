// Stores the whole app on the device the first time it is opened, so everything
// after that, including reading photos, works with no connection.
// Bump VERSION whenever any file in the list changes.
const VERSION = 'undisputed-v11';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/db.js',
  'js/store.js',
  'js/sync.js',
  'js/model.js',
  'js/ui.js',
  'js/charts.js',
  'js/views/common.js',
  'js/views/home.js',
  'js/views/charts.js',
  'js/views/rounds.js',
  'js/views/belts.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'js/views/scan.js',
  'js/views/team.js',
  'js/ocr/image.js',
  'js/ocr/parse.js',
  'js/ocr/verify.js',
  'js/ocr/reader.js',
  'vendor/fonts/barlow-latin-400-normal.woff2',
  'vendor/fonts/barlow-latin-500-normal.woff2',
  'vendor/fonts/barlow-latin-600-normal.woff2',
  'vendor/fonts/barlow-condensed-latin-500-normal.woff2',
  'vendor/fonts/barlow-condensed-latin-600-normal.woff2',
  'vendor/fonts/barlow-condensed-latin-700-normal.woff2',
  'vendor/fonts/barlow-condensed-latin-700-italic.woff2',
  'vendor/fonts/barlow-condensed-latin-800-italic.woff2',
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/eng.traineddata.gz',
];

// GitHub Pages lets the browser keep files for 10 minutes, so every file is
// fetched fresh; otherwise an update could store the previous version's files.
self.addEventListener('install', (event) => {
  const fresh = FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(fresh)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'activate') self.skipWaiting();
});

// While running on this computer, fresh files win so edits show up immediately.
// The cached copy is still used when the local server is switched off.
const IS_LOCAL = self.location.hostname === 'localhost';

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Sync talks to GitHub directly; only the app's own files are cached.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (IS_LOCAL) {
      try {
        return await fetch(event.request, { cache: 'no-store' });
      } catch { /* server is off: fall through to the stored copy */ }
    }
    const hit = await cache.match(event.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(event.request);
    } catch (err) {
      if (event.request.mode === 'navigate') {
        const page = await cache.match('index.html');
        if (page) return page;
      }
      throw err;
    }
  })());
});
