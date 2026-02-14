function handleStateChange(worker: ServiceWorker, registration: ServiceWorkerRegistration) {
  if (worker.state === 'installed' && navigator.serviceWorker.controller) {
    // Nouvelle version disponible
    console.log('[SW] Nouvelle version installée, prête pour activation');

    // Émettre un événement personnalisé
    window.dispatchEvent(new CustomEvent('sw-update-available', {
      detail: { registration: registration }
    }));
  }
}

function handleUpdateFound(registration: ServiceWorkerRegistration) {
  const newWorker = registration.installing;
  console.log('[SW] Nouvelle version trouvée');

  if (newWorker) {
    newWorker.addEventListener('statechange', () => handleStateChange(newWorker, registration));
  }
}

function onWindowLoad() {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then(function(registration) {
      console.log("[SW] Enregistré:", registration.scope);

      // Écouter les mises à jour
      registration.addEventListener('updatefound', () => handleUpdateFound(registration));
    })
    .catch(function(error) {
      console.error("[SW] Échec de l'enregistrement:", error);
    });

  // Écouter les messages du service worker
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data?.type === 'SW_UPDATE') {
      console.log('[SW] Message reçu:', event.data);
    }
  });
}

export function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", onWindowLoad);

    // Gérer le contrôle du service worker
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      console.log('[SW] Nouveau contrôleur, rechargement...');
    });
  }
}