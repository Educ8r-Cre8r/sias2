/**
 * SIAS — Service Worker
 * Progressive Web App caching with per-resource strategies.
 */

const CACHE_VERSION = 'v4';
const SHELL_CACHE = `sias-shell-${CACHE_VERSION}`;
const METADATA_CACHE = `sias-metadata-${CACHE_VERSION}`;
const CONTENT_CACHE = `sias-content-${CACHE_VERSION}`;
const IMAGE_CACHE = `sias-images-${CACHE_VERSION}`;
const PDF_CACHE = `sias-pdfs-${CACHE_VERSION}`;
const CDN_CACHE = `sias-cdn-${CACHE_VERSION}`;

const ALL_CACHES = [SHELL_CACHE, METADATA_CACHE, CONTENT_CACHE, IMAGE_CACHE, PDF_CACHE, CDN_CACHE];

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/firebase-config.js',
  '/ratings.js',
  '/comments.js',
  '/favorites.js',
  '/tutorial-modal.js',
  '/tutorial-modal.css',
  '/lib/marked.min.js',
  '/lib/particles.min.js',
  '/sias_logo.png',
  '/favicon.png',
  '/AR.png',
  '/Alex_name.png',
  '/visionary.png',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// URLs that must NEVER be cached (Firestore, Auth, APIs)
const NETWORK_ONLY_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'api.web3forms.com',
  'www.googleapis.com/identitytoolkit',
  'accounts.google.com'
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('sias-') && !ALL_CACHES.includes(name))
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: route to appropriate strategy ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const request = event.request;

  // Skip non-GET requests (POST for contact form, Firestore writes, etc.)
  if (request.method !== 'GET') return;

  // Skip admin-v2 — it has its own service worker and PWA scope
  if (url.pathname.startsWith('/admin-v2')) return;

  // Network-only: Firebase/Auth/API calls — don't interfere
  if (NETWORK_ONLY_PATTERNS.some(pattern => request.url.includes(pattern))) {
    return;
  }

  // 0. Firebase Storage assets → same cache strategy as local files
  if (request.url.includes('firebasestorage.googleapis.com') && request.url.includes('sias-8178a')) {
    if (request.url.includes(encodeURIComponent('images/'))) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
      return;
    }
    if (request.url.includes(encodeURIComponent('pdfs/')) ||
        request.url.includes(encodeURIComponent('5e_lessons/'))) {
      event.respondWith(cacheFirst(request, PDF_CACHE));
      return;
    }
  }

  // 1. gallery-metadata.json and ngss-index.json → Network First
  if (url.pathname === '/gallery-metadata.json' || url.pathname === '/ngss-index.json') {
    event.respondWith(networkFirst(request, METADATA_CACHE));
    return;
  }

  // 2. Content JSONs and Hotspot JSONs → Network First
  if (url.pathname.startsWith('/content/') || url.pathname.startsWith('/hotspots/')) {
    event.respondWith(networkFirst(request, CONTENT_CACHE));
    return;
  }

  // 3. Gallery images and hero images → Cache First
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/hero_images/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 4. PDFs → Cache First
  if (url.pathname.startsWith('/pdfs/')) {
    event.respondWith(cacheFirst(request, PDF_CACHE));
    return;
  }

  // 5. Firebase CDN and Creative Commons icons → Cache First
  if (request.url.includes('gstatic.com/firebasejs') ||
      request.url.includes('mirrors.creativecommons.org')) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // 6. Same-origin app shell resources (HTML, CSS, JS) → Network First
  //    so deployments are picked up immediately while still working offline
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Default: let the browser handle normally
});

// ── Cache First: try cache, fall back to network ──
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Network First: try network, fall back to cache ──
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
