// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

/**
 * Utilitaires de stockage offline pour Anima
 * Utilise IndexedDB pour persister les données localement
 */

const DB_NAME = 'anima-offline-db';
const DB_VERSION = 1;

// Helper function for cryptographically secure random string
function generateSecureId(): string {
  const randomValues = new Uint32Array(9);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => value.toString(36)).join('').slice(0, 9);
}

// Noms des stores
export const STORES = {
  MESSAGES: 'messages',
  ROOMS: 'rooms',
  SETTINGS: 'settings',
  PENDING_ACTIONS: 'pending-actions',
  CACHE: 'cache',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

// Interface pour les messages en file d'attente
export interface QueuedMessage {
  id: string;
  roomId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'signal';
  retryCount: number;
  maxRetries: number;
}

// Interface pour les actions en attente
export interface PendingAction {
  id: string;
  type: 'join' | 'leave' | 'message' | 'settings';
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

// Interface pour les paramètres stockés
export interface StoredSettings {
  key: string;
  value: unknown;
  updatedAt: number;
}

/**
 * Ouvre la base de données IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store pour les messages en file d'attente
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        messageStore.createIndex('roomId', 'roomId', { unique: false });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Store pour l'historique des rooms
      if (!db.objectStoreNames.contains(STORES.ROOMS)) {
        const roomStore = db.createObjectStore(STORES.ROOMS, { keyPath: 'id' });
        roomStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }

      // Store pour les paramètres
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Store pour les actions en attente
      if (!db.objectStoreNames.contains(STORES.PENDING_ACTIONS)) {
        const actionStore = db.createObjectStore(STORES.PENDING_ACTIONS, { keyPath: 'id' });
        actionStore.createIndex('timestamp', 'timestamp', { unique: false });
        actionStore.createIndex('type', 'type', { unique: false });
      }

      // Store pour le cache général
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        const cacheStore = db.createObjectStore(STORES.CACHE, { keyPath: 'key' });
        cacheStore.createIndex('expires', 'expires', { unique: false });
      }
    };
  });
}

/**
 * Ajoute un message à la file d'attente pour envoi différé
 */
export async function queueMessage(
  roomId: string,
  content: string,
  type: QueuedMessage['type'] = 'text'
): Promise<QueuedMessage> {
  const db = await openDB();
  const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
  const store = transaction.objectStore(STORES.MESSAGES);

  const message: QueuedMessage = {
    id: `${Date.now()}-${generateSecureId()}`,
    roomId,
    content,
    timestamp: Date.now(),
    type,
    retryCount: 0,
    maxRetries: 5,
  };

  return new Promise((resolve, reject) => {
    const request = store.add(message);
    request.onsuccess = () => resolve(message);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère tous les messages en file d'attente pour une room
 */
export async function getQueuedMessages(roomId?: string): Promise<QueuedMessage[]> {
  const db = await openDB();
  const transaction = db.transaction([STORES.MESSAGES], 'readonly');
  const store = transaction.objectStore(STORES.MESSAGES);

  return new Promise((resolve, reject) => {
    let request: IDBRequest;

    if (roomId) {
      const index = store.index('roomId');
      request = index.getAll(roomId);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => resolve(request.result as QueuedMessage[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime un message de la file d'attente
 */
export async function removeQueuedMessage(messageId: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
  const store = transaction.objectStore(STORES.MESSAGES);

  return new Promise((resolve, reject) => {
    const request = store.delete(messageId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Incrémente le compteur de retry d'un message
 */
export async function incrementMessageRetry(messageId: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
  const store = transaction.objectStore(STORES.MESSAGES);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(messageId);

    getRequest.onsuccess = () => {
      const message = getRequest.result as QueuedMessage;
      if (message) {
        message.retryCount++;
        const putRequest = store.put(message);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Ajoute une action en attente
 */
export async function addPendingAction(
  type: PendingAction['type'],
  payload: unknown
): Promise<PendingAction> {
  const db = await openDB();
  const transaction = db.transaction([STORES.PENDING_ACTIONS], 'readwrite');
  const store = transaction.objectStore(STORES.PENDING_ACTIONS);

  const action: PendingAction = {
    id: `${Date.now()}-${generateSecureId()}`,
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const request = store.add(action);
    request.onsuccess = () => resolve(action);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère toutes les actions en attente
 */
export async function getPendingActions(type?: PendingAction['type']): Promise<PendingAction[]> {
  const db = await openDB();
  const transaction = db.transaction([STORES.PENDING_ACTIONS], 'readonly');
  const store = transaction.objectStore(STORES.PENDING_ACTIONS);

  return new Promise((resolve, reject) => {
    let request: IDBRequest;

    if (type) {
      const index = store.index('type');
      request = index.getAll(type);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const actions = request.result as PendingAction[];
      // Trier par timestamp
      actions.sort((a, b) => a.timestamp - b.timestamp);
      resolve(actions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime une action en attente
 */
export async function removePendingAction(actionId: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.PENDING_ACTIONS], 'readwrite');
  const store = transaction.objectStore(STORES.PENDING_ACTIONS);

  return new Promise((resolve, reject) => {
    const request = store.delete(actionId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sauvegarde un paramètre
 */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
  const store = transaction.objectStore(STORES.SETTINGS);

  const setting: StoredSettings = {
    key,
    value,
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const request = store.put(setting);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère un paramètre
 */
export async function getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const db = await openDB();
  const transaction = db.transaction([STORES.SETTINGS], 'readonly');
  const store = transaction.objectStore(STORES.SETTINGS);

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result as StoredSettings | undefined;
      resolve(result ? (result.value as T) : defaultValue);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stocke une valeur dans le cache avec expiration
 */
export async function setCacheItem<T>(
  key: string,
  value: T,
  ttlMinutes: number = 60
): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.CACHE], 'readwrite');
  const store = transaction.objectStore(STORES.CACHE);

  const item = {
    key,
    value,
    expires: Date.now() + ttlMinutes * 60 * 1000,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère une valeur du cache
 */
export async function getCacheItem<T>(key: string): Promise<T | null> {
  const db = await openDB();
  const transaction = db.transaction([STORES.CACHE], 'readonly');
  const store = transaction.objectStore(STORES.CACHE);

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result as { value: T; expires: number } | undefined;

      if (!result) {
        resolve(null);
        return;
      }

      // Vérifier l'expiration
      if (result.expires < Date.now()) {
        // Supprimer l'entrée expirée
        removeCacheItem(key);
        resolve(null);
        return;
      }

      resolve(result.value);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime une entrée du cache
 */
export async function removeCacheItem(key: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORES.CACHE], 'readwrite');
  const store = transaction.objectStore(STORES.CACHE);

  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Nettoie les entrées de cache expirées
 */
export async function cleanExpiredCache(): Promise<number> {
  const db = await openDB();
  const transaction = db.transaction([STORES.CACHE], 'readwrite');
  const store = transaction.objectStore(STORES.CACHE);
  const index = store.index('expires');

  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.upperBound(Date.now());
    const request = index.openCursor(range);
    let deletedCount = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Efface toutes les données offline (utilisé pour la déconnexion)
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await openDB();

  const stores = Object.values(STORES);
  const transaction = db.transaction(stores, 'readwrite');

  await Promise.all(
    stores.map((storeName) => {
      return new Promise<void>((resolve, reject) => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    })
  );
}

/**
 * Récupère les statistiques de stockage
 */
export async function getStorageStats(): Promise<{
  messages: number;
  pendingActions: number;
  settings: number;
  cache: number;
}> {
  const db = await openDB();

  const stats = {
    messages: 0,
    pendingActions: 0,
    settings: 0,
    cache: 0,
  };

  const transaction = db.transaction(
    [STORES.MESSAGES, STORES.PENDING_ACTIONS, STORES.SETTINGS, STORES.CACHE],
    'readonly'
  );

  await Promise.all([
    new Promise<void>((resolve) => {
      const request = transaction.objectStore(STORES.MESSAGES).count();
      request.onsuccess = () => {
        stats.messages = request.result;
        resolve();
      };
    }),
    new Promise<void>((resolve) => {
      const request = transaction.objectStore(STORES.PENDING_ACTIONS).count();
      request.onsuccess = () => {
        stats.pendingActions = request.result;
        resolve();
      };
    }),
    new Promise<void>((resolve) => {
      const request = transaction.objectStore(STORES.SETTINGS).count();
      request.onsuccess = () => {
        stats.settings = request.result;
        resolve();
      };
    }),
    new Promise<void>((resolve) => {
      const request = transaction.objectStore(STORES.CACHE).count();
      request.onsuccess = () => {
        stats.cache = request.result;
        resolve();
      };
    }),
  ]);

  return stats;
}

/**
 * Vérifie si IndexedDB est supporté et disponible
 */
export function isIndexedDBAvailable(): boolean {
  return 'indexedDB' in window;
}

export default {
  queueMessage,
  getQueuedMessages,
  removeQueuedMessage,
  addPendingAction,
  getPendingActions,
  removePendingAction,
  saveSetting,
  getSetting,
  setCacheItem,
  getCacheItem,
  removeCacheItem,
  cleanExpiredCache,
  clearAllOfflineData,
  getStorageStats,
  isIndexedDBAvailable,
  STORES,
};
