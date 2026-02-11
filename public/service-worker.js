// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

const CACHE_NAME = "anima-v2";
const STATIC_CACHE = "anima-static-v2";
const DYNAMIC_CACHE = "anima-dynamic-v2";
const IMAGE_CACHE = "anima-images-v2";

// Version du cache pour invalidation
const CACHE_VERSION = "2.1";

// Ressources à mettre en cache immédiatement (critical assets)
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Extensions de fichiers à mettre en cache
const CACHEABLE_EXTENSIONS = [
  ".js",
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".ico",
  ".json",
];

// URLs à ne jamais mettre en cache
const NEVER_CACHE = [
  "/api/",
  "/ws",
  "/socket",
  "/peerjs",
  "/signal",
  "/turn",
  "/stun",
];

// Routes de l'application à mettre en cache
const APP_ROUTES = [
  "/",
  "/join",
  "/room",
];

// Installation - Mise en cache des ressources statiques critiques
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installation v" + CACHE_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[Service Worker] Pré-cache des ressources critiques");
      return cache.addAll(PRECACHE_URLS);
    }).catch((err) => {
      console.error("[Service Worker] Erreur de pré-cache:", err);
    })
  );

  self.skipWaiting();
});

// Activation - Nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activation v" + CACHE_VERSION);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            // Supprimer les caches qui ne correspondent pas aux noms actuels
            return (
              cacheName !== STATIC_CACHE &&
              cacheName !== DYNAMIC_CACHE &&
              cacheName !== IMAGE_CACHE
            );
          })
          .map((cacheName) => {
            console.log("[Service Worker] Suppression ancien cache:", cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );

  // Prendre le contrôle immédiatement
  return self.clients.claim();
});

// Fonction utilitaire pour vérifier si une URL doit être mise en cache
const shouldCache = (url) => {
  const urlObj = new URL(url);

  // Ne pas mettre en cache les WebSockets
  if (urlObj.protocol === "ws:" || urlObj.protocol === "wss:") {
    return false;
  }

  // Ne pas mettre en cache les URLs exclues
  if (NEVER_CACHE.some((pattern) => url.includes(pattern))) {
    return false;
  }

  // Ne pas mettre en cache les requêtes avec query params (sauf pour les assets statiques)
  if (urlObj.search && !CACHEABLE_EXTENSIONS.some((ext) => url.endsWith(ext))) {
    return false;
  }

  return true;
};

// Fonction pour déterminer le type de cache
const getCacheForRequest = (request) => {
  const url = request.url;

  // Images dans leur propre cache
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url)) {
    return IMAGE_CACHE;
  }

  // Assets statiques (JS, CSS, fonts)
  if (/\.(js|css|woff|woff2|ttf)$/i.test(url)) {
    return STATIC_CACHE;
  }

  // Tout le reste dans le cache dynamique
  return DYNAMIC_CACHE;
};

// Interception des requêtes - Stratégie optimisée
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // Ignorer les requêtes non-GET
  if (request.method !== "GET") {
    return;
  }

  // Ne pas intercepter les requêtes qui ne doivent pas être mises en cache
  if (!shouldCache(url)) {
    return;
  }

  // Stratégie: Cache First pour les assets statiques, Network First pour le reste
  const isStaticAsset = CACHEABLE_EXTENSIONS.some((ext) => url.endsWith(ext));

  if (isStaticAsset) {
    // Cache First pour les assets statiques
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Rafraîchir en arrière-plan (stale-while-revalidate)
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                const cacheName = getCacheForRequest(request);
                const responseToCache = networkResponse.clone();
                caches.open(cacheName).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
            })
            .catch(() => {});

          return cachedResponse;
        }

        // Pas en cache, récupérer du réseau
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse.ok) {
              return networkResponse;
            }

            // Mettre en cache
            const cacheName = getCacheForRequest(request);
            const responseToCache = networkResponse.clone();
            return caches.open(cacheName).then((cache) => {
              cache.put(request, responseToCache);
              return networkResponse;
            });
          })
          .catch((error) => {
            console.error("[Service Worker] Erreur fetch:", error);
            // Pour les images, retourner une image par défaut si disponible
            if (request.destination === "image") {
              return caches.match("/icons/icon-192x192.png");
            }
            throw error;
          });
      })
    );
  } else {
    // Network First pour les pages et autres ressources
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (!networkResponse.ok) {
            return networkResponse;
          }

          // Mettre en cache en arrière-plan - clone the response before using it
          const cacheName = getCacheForRequest(request);
          const responseToCache = networkResponse.clone();
          caches.open(cacheName).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Fallback sur le cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            // Page offline pour les documents
            if (request.destination === "document") {
              return caches.match("/offline.html");
            }

            throw new Error("Ressource non disponible");
          });
        })
    );
  }
});

// Gestion des messages depuis la page principale
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // Message pour vérifier la version du cache
  if (event.data && event.data.type === "GET_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }

  // Message pour vérifier si une mise à jour est disponible
  if (event.data && event.data.type === "CHECK_UPDATE") {
    self.registration.update().then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ updated: true });
      }
    });
  }

  // Message pour forcer le nettoyage du cache
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ cleared: true });
        }
      })
    );
  }

  // Message pour obtenir les statistiques du cache
  if (event.data && event.data.type === "GET_CACHE_STATS") {
    event.waitUntil(
      caches.keys().then(async (cacheNames) => {
        const stats = {};
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          stats[name] = keys.length;
        }
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ stats });
        }
      })
    );
  }
});

// Gestion de la synchronisation en arrière-plan (pour les messages hors ligne)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-messages") {
    event.waitUntil(syncMessages());
  }

  if (event.tag === "sync-pending-actions") {
    event.waitUntil(syncPendingActions());
  }
});

// Fonction pour synchroniser les messages
async function syncMessages() {
  console.log("[Service Worker] Synchronisation des messages...");

  // Notifier tous les clients que la sync commence
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_STARTED',
      tag: 'sync-messages'
    });
  });

  // La logique de synchronisation est gérée par l'application via IndexedDB
  // Le SW notifie juste que la sync est demandée

  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETED',
      tag: 'sync-messages'
    });
  });
}

// Fonction pour synchroniser les actions en attente
async function syncPendingActions() {
  console.log("[Service Worker] Synchronisation des actions en attente...");

  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_STARTED',
      tag: 'sync-pending-actions'
    });
  });

  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETED',
      tag: 'sync-pending-actions'
    });
  });
}

// Gestion des notifications push (pour les appels entrants)
self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json();

    // Options par défaut
    const notificationOptions = {
      body: data.body || "Nouvelle notification",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag || "default",
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
      data: data.data || {},
      vibrate: data.vibrate || [200, 100, 200],
      renotify: data.renotify || false,
      silent: data.silent || false,
      // Image pour les notifications riches
      image: data.image || undefined,
      // Timestamp pour l'ordre d'affichage
      timestamp: data.timestamp || Date.now(),
    };

    // Actions spécifiques pour les appels entrants
    if (data.type === 'incoming-call') {
      notificationOptions.actions = [
        {
          action: 'accept',
          title: 'Répondre',
          icon: '/icons/icon-192x192.png'
        },
        {
          action: 'decline',
          title: 'Refuser',
          icon: '/icons/icon-192x192.png'
        }
      ];
      notificationOptions.requireInteraction = true;
      notificationOptions.renotify = true;
    }

    // Actions pour les messages
    if (data.type === 'message') {
      notificationOptions.actions = [
        {
          action: 'reply',
          title: 'Répondre',
          icon: '/icons/icon-192x192.png'
        },
        {
          action: 'dismiss',
          title: 'Ignorer',
          icon: '/icons/icon-192x192.png'
        }
      ];
    }

    event.waitUntil(
      self.registration.showNotification(data.title || "Anima", notificationOptions)
    );
  }
});

// Gestion du clic sur les notifications
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Gérer les actions spécifiques
  if (action === 'accept' && data.roomId) {
    // Accepter l'appel - ouvrir la room
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        // Chercher une fenêtre existante
        for (const client of clientList) {
          if ("focus" in client) {
            client.postMessage({
              type: 'CALL_ACCEPTED',
              roomId: data.roomId
            });
            return client.focus();
          }
        }

        // Ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(`/room/${data.roomId}`);
        }
      })
    );
    return;
  }

  if (action === 'decline') {
    // Refuser l'appel - notifier l'application
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        clientList.forEach(client => {
          client.postMessage({
            type: 'CALL_DECLINED',
            roomId: data.roomId
          });
        });
      })
    );
    return;
  }

  if (action === 'reply') {
    // Ouvrir la room pour répondre
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.postMessage({
              type: 'OPEN_REPLY',
              roomId: data.roomId
            });
            return client.focus();
          }
        }

        if (clients.openWindow && data.roomId) {
          return clients.openWindow(`/room/${data.roomId}`);
        }
      })
    );
    return;
  }

  // Comportement par défaut : ouvrir ou focaliser l'application
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Ouvrir ou focaliser une fenêtre existante
      for (const client of clientList) {
        if ("focus" in client) {
          // Si une room est spécifiée dans la notification, y naviguer
          if (data.roomId && !client.url.includes(data.roomId)) {
            client.navigate(`/room/${data.roomId}`);
          }
          return client.focus();
        }
      }

      // Ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        const url = data.roomId ? `/room/${data.roomId}` : "/";
        return clients.openWindow(url);
      }
    })
  );
});

// Gestion de la fermeture des notifications
self.addEventListener("notificationclose", (event) => {
  console.log("[Service Worker] Notification fermée:", event.notification.tag);
});

// Gestion des erreurs de notification
self.addEventListener("error", (event) => {
  console.error("[Service Worker] Erreur:", event.error);
});

// Gestion des rejets de promesses non catchés
self.addEventListener("unhandledrejection", (event) => {
  console.error("[Service Worker] Rejet non géré:", event.reason);
});
