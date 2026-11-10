/**
 * NTK OmniStream Studio - Universal PWA Service Worker
 * Provides offline app-shell caching while keeping streaming and API endpoints network-direct.
 */

const CACHE_NAME = 'ntk-omnistream-studio-v2026-11-r3-transcribe1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './css/style.css',
  './css/components.css',
  './css/tutorial.css',
  './css/player.css',
  './css/visualizer.css',
  './lib/lame.all.js',
  './lib/jszip.min.js',
  './lib/demucs-web/index.js',
  './lib/demucs-web/constants.js',
  './lib/demucs-web/fft.js',
  './lib/demucs-web/processor.js',
  './css/transcribe.css',
  './js/transcribe-studio.js',
  './js/transcribe-engine.js',
  './js/transcript-store.js',
  './lib/mediabunny/mediabunny.js',
  './lib/mediabunny/LICENSE.txt',
  './lib/mediabunny/NOTICE.txt',
  './js/app.js',
  './js/ai-policy.js',
  './js/lyric-alignment.js',
  './js/network-policy.js',
  './js/image-cropper.js',
  './js/tutorial.js',
  './js/omni-api.js',
  './js/video-demuxer.js',
  './js/suno-api.js',
  './js/crypto-engine.js',
  './js/audio-converter.js',
  './js/mp3-encoder.js',
  './js/id3-writer.js',
  './js/lyrics-utils.js',
  './js/vault-db.js',
  './js/stem-engine.js',
  './js/stem-mixer.js',
  './js/audio-fx.js',
  './js/zip-packager.js',
  './js/video-generator.js',
  './js/bookmarklet.js',
  './js/storage.js',
  './js/player.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use resilient allSettled caching so one missing asset doesn't fail the whole installation
      return Promise.allSettled(
        APP_SHELL_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[PWA SW] Pre-cache skipped asset: ${asset}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key.startsWith('ntk-omnistream-studio-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept local API endpoints or cross-origin media/model streams
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    return;
  }

  // Network-first with resilient offline cache fallback
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return networkRes;
      })
      .catch(async () => {
        const appCache = await caches.open(CACHE_NAME);
        // 1. Match asset cache ignoring query parameters (e.g. ?v=2026.10)
        const cachedAsset = await appCache.match(req, { ignoreSearch: true });
        if (cachedAsset) {
          return cachedAsset;
        }

        // 2. ONLY fallback to index.html for navigation / document requests.
        // Never return HTML for CSS/JS/images to avoid MIME-type parsing errors.
        if (req.mode === 'navigate' || req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
          const cachedShell = await appCache.match('./index.html', { ignoreSearch: true });
          if (cachedShell) return cachedShell;
          return (await appCache.match('./', { ignoreSearch: true })) || new Response('Open the app once online to cache its offline shell.', { status: 503 });
        }

        // 3. For uncached subresources during offline mode, return a 503 rather than HTML
        return new Response('Asset unavailable offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});
