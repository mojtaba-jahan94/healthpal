/**
 * Service Worker - پشتیبانی کامل از حالت آفلاین و PWA
 */

const CACHE_NAME = 'healthpal-v1.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/food-database.js',
  './js/google-fit.js',
  './js/gemini.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// هنگام نصب Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('[SW] Caching some assets failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// هنگام فعال‌سازی و پاک‌سازی کش‌های قدیمی
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// استراتژی پاسخ‌دهی به درخواست‌ها (Cache-First با شبکه به عنوان پشتیبان)
self.addEventListener('fetch', (event) => {
  // اگر درخواست برای گوگل یا منابع خارجی باشد، به طور مستقیم برود
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // در صورت عدم دسترسی به شبکه و فایل
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
