// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

const CACHE_NAME = 'meetclone-v1';
const STATIC_CACHE = 'meetclone-static-v1';
const DYNAMIC_CACHE = 'meetclone-dynamic-v1';

// Ressources à mettre en cache immédiatement
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
];

// Installation - Mise en cache des ressources statiques
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Pré-cache des ressources');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  
  self.skipWaiting();
});

// Activation - Nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE)
          .map(cacheName => caches.delete(cacheName))
      );
    })
  );
  
  return self.clients.claim();
});

// Interception des requêtes - Stratégie Cache First pour les ressources statiques
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ne pas mettre en cache les requêtes WebSocket ou les API externes
  if (request.url.includes('/ws') || 
      request.url.includes('/api/realtime') ||
      url.protocol === 'ws:' || 
      url.protocol === 'wss:') {
    return;
  }
  
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Ressource trouvée en cache
        return cachedResponse;
      }
      
      // Ressource non trouvée, récupérer du réseau
      return fetch(request).then((networkResponse) => {
        // Mettre en cache les nouvelles ressources
        if (request.method === 'GET') {
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        }
        
        return networkResponse;
      }).catch(() => {
        // Réseau indisponible, afficher la page offline
        if (request.destination === 'document') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});

// Gestion des messages depuis la page principale
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
