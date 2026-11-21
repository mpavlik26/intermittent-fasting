const CACHE_NAME = 'fasting-tracker-US-25-ver-1';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=16',
  './js/state.js?v=9',
  './js/time-utils.js?v=2',
  './js/history.js?v=3',
  './js/transitions.js?v=7',
  './js/simulator.js?v=3',
  './js/bonus-storage.js?v=7',
  './js/end-eating.js?v=1',
  './js/ui.js?v=10',
  './js/manual-session.js?v=4',
  './js/main.js?v=6',
  './manifest.json?v=6',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Optional: Clear old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
