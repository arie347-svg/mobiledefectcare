// MDC Mobile Service Worker - PWA Offline & Resilient Static Asset Caching
const CACHE_VERSION = 'v2';
const APP_SHELL_CACHE = `mdc-app-shell-${CACHE_VERSION}`;
const STATIC_ASSETS_CACHE = `mdc-static-assets-${CACHE_VERSION}`;
const FONT_CACHE = `mdc-fonts-${CACHE_VERSION}`;
const CDN_CACHE = `mdc-cdn-${CACHE_VERSION}`;

const CURRENT_CACHES = [APP_SHELL_CACHE, STATIC_ASSETS_CACHE, FONT_CACHE, CDN_CACHE];

// Critical core assets to pre-cache immediately upon install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap',
  'https://unpkg.com/@zxing/library@0.23.0',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// 1. Install: Pre-cache assets safely using Promise.allSettled and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            let targetCacheName = STATIC_ASSETS_CACHE;
            if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
              targetCacheName = FONT_CACHE;
            } else if (url.includes('unpkg.com') || url.includes('cdnjs.cloudflare.com')) {
              targetCacheName = CDN_CACHE;
            } else if (url === '/' || url === '/index.html') {
              targetCacheName = APP_SHELL_CACHE;
            }

            const cache = await caches.open(targetCacheName);
            const response = await fetch(url, {
              mode: url.startsWith('http') ? 'cors' : 'same-origin',
            });
            if (response && (response.ok || response.type === 'opaque')) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('[SW] Pre-cache item failed (continuing):', url, err);
          }
        })
      );
      console.log('[SW] Pre-cache completed for', results.length, 'items');
    })()
  );
});

// 2. Activate: Clean up legacy caches and immediately take control of all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (!CURRENT_CACHES.includes(cache)) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Route requests to optimized caching strategies
self.addEventListener('fetch', (event) => {
  // Hanya proses method GET
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Bypass cache untuk backend API dan Google Apps Script
  if (
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.hostname.includes('script.google.com')
  ) {
    return;
  }

  // A. STRATEGI: GOOGLE FONTS (fonts.googleapis.com & fonts.gstatic.com)
  // Cache-First dengan background revalidate agar tipografi muncul instan tanpa FOUT
  if (
    requestUrl.hostname === 'fonts.googleapis.com' ||
    requestUrl.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        
        // Fetch di latar belakang untuk memperbarui cache jika online
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetchPromise;
        if (networkResponse) {
          return networkResponse;
        }

        return new Response('/* Font unavailable offline */', {
          headers: { 'Content-Type': 'text/css' },
        });
      })
    );
    return;
  }

  // B. STRATEGI: LOGO, IKON & ASET GAMBAR STATIS
  // Cache-First dengan background update agar logo & icon selalu responsif saat sinyal lemah
  const isImageOrIcon =
    requestUrl.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|gif|woff2?|ttf)$/i) ||
    requestUrl.pathname === '/manifest.webmanifest' ||
    requestUrl.pathname.includes('/icon-') ||
    requestUrl.pathname.includes('apple-touch-icon');

  if (isImageOrIcon) {
    event.respondWith(
      caches.open(STATIC_ASSETS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetchPromise;
        if (networkResponse) {
          return networkResponse;
        }

        // Fallback logo jika request gambar gagal saat offline
        if (requestUrl.pathname.includes('icon') || requestUrl.pathname.endsWith('.png')) {
          const fallbackLogo = await cache.match('/icon-192.png');
          if (fallbackLogo) {
            return fallbackLogo;
          }
        }

        return new Response('Aset tidak tersedia secara offline', { status: 404 });
      })
    );
    return;
  }

  // C. STRATEGI: CDN EKSTERNAL (ZXing barcode, jsPDF LKUAT)
  // Cache-First agar fitur scanner dan print dokumen tetap berfungsi saat offline
  if (
    requestUrl.hostname.includes('unpkg.com') ||
    requestUrl.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || new Response('/* CDN asset unavailable offline */', {
            headers: { 'Content-Type': 'application/javascript' },
          });
        }
      })
    );
    return;
  }

  // D. STRATEGI: APP SHELL (HTML, JS Bundles, CSS)
  // Network-First dengan Cache Fallback cepat untuk navigasi halaman SPA
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fallback ke index.html untuk navigasi SPA
        if (event.request.mode === 'navigate' || event.request.destination === 'document') {
          const fallbackApp = await caches.match('/index.html') || await caches.match('/');
          if (fallbackApp) {
            return fallbackApp;
          }
        }

        return new Response('Koneksi internet tidak stabil / offline.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
