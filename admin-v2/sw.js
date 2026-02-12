/**
 * SIAS Admin Dashboard — Service Worker
 * Lightweight: caches app shell for installability + fast reloads.
 * All data operations (Firestore, Cloud Functions) are network-only.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `sias-admin-shell-${CACHE_VERSION}`;
const CDN_CACHE = `sias-admin-cdn-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, CDN_CACHE];

// App shell — the static files that make up the admin UI
const APP_SHELL = [
  '/admin-v2/',
  '/admin-v2/index.html',
  '/admin-v2/css/admin-dashboard.css',
  '/admin-v2/js/auth.js',
  '/admin-v2/js/app.js',
  '/admin-v2/js/metadata.js',
  '/admin-v2/js/processing-table.js',
  '/admin-v2/js/queue-monitor.js',
  '/admin-v2/js/delete-manager.js',
  '/admin-v2/js/image-detail.js',
  '/admin-v2/js/content-editor.js',
  '/admin-v2/js/hotspot-editor.js',
  '/admin-v2/js/content-audit.js',
  '/admin-v2/js/search-filter.js',
  '/admin-v2/js/upload-manager.js',
  '/admin-v2/js/reprocess-manager.js',
  '/admin-v2/js/ngss-coverage.js',
  '/admin-v2/js/activity-feed.js',
  '/admin-v2/js/analytics.js',
  '/admin-v2/js/comment-moderation.js',
  '/admin-v2/js/orphan-detector.js',
  '/admin-v2/js/notifications.js',
  '/admin-v2/js/deploy-status.js',
  '/admin-v2/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Patterns that must NEVER be cached (Firebase services, APIs)
const NETWORK_ONLY_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'cloudfunctions.net',
  'accounts.google.com',
  'www.googleapis.com',
  'gallery-metadata.json'
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('sias-admin-') && !ALL_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for everything, cache shell as fallback ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Network-only: Firebase services & APIs — never intercept
  if (NETWORK_ONLY_PATTERNS.some(p => request.url.includes(p))) return;

  // Firebase CDN (JS SDK files) — cache-first, they're versioned
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // Admin app shell files — network-first with cache fallback
  // This ensures you always get fresh code after deploys
  if (url.origin === self.location.origin && url.pathname.startsWith('/admin-v2')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Shared icons — cache-first
  if (url.origin === self.location.origin && url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

// ── Strategies ──

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
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // If navigating, fall back to cached admin index
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/admin-v2/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
