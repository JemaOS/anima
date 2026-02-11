// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  queueMessage,
  getQueuedMessages,
  removeQueuedMessage,
  addPendingAction,
  getPendingActions,
  removePendingAction,
  saveSetting,
  getSetting,
  getStorageStats,
  isIndexedDBAvailable,
  type QueuedMessage,
  type PendingAction,
} from '@/utils/offlineStorage';

export interface OfflineSupportState {
  /** Si le mode offline est supporté */
  isSupported: boolean;
  /** Si actuellement hors ligne */
  isOffline: boolean;
  /** Nombre de messages en file d'attente */
  queuedMessagesCount: number;
  /** Nombre d'actions en attente */
  pendingActionsCount: number;
  /** Si une synchronisation est en cours */
  isSyncing: boolean;
  /** Dernière synchronisation */
  lastSyncTime: Date | null;
  /** Erreur de synchronisation */
  syncError: string | null;
}

export interface OfflineSupportActions {
  /** Enregistrer un message pour envoi différé */
  queueMessage: (roomId: string, content: string, type?: QueuedMessage['type']) => Promise<QueuedMessage | null>;
  /** Ajouter une action en attente */
  addPendingAction: (type: PendingAction['type'], payload: unknown) => Promise<PendingAction | null>;
  /** Synchroniser les données en attente */
  syncPendingData: () => Promise<void>;
  /** Sauvegarder un paramètre */
  saveSetting: <T>(key: string, value: T) => Promise<void>;
  /** Récupérer un paramètre */
  getSetting: <T>(key: string, defaultValue?: T) => Promise<T | undefined>;
  /** Effacer toutes les données offline */
  clearOfflineData: () => Promise<void>;
  /** Rafraîchir les statistiques */
  refreshStats: () => Promise<void>;
}

export type OfflineSupport = OfflineSupportState & OfflineSupportActions;

export interface UseOfflineSupportOptions {
  /** Callback quand on revient en ligne */
  onBackOnline?: () => void;
  /** Callback quand on passe hors ligne */
  onGoneOffline?: () => void;
  /** Synchronisation automatique au retour en ligne */
  autoSync?: boolean;
  /** Intervalle de synchronisation en ms (0 pour désactiver) */
  syncInterval?: number;
}

/**
 * Hook pour gérer le support offline de l'application
 *
 * Fournit :
 * - File d'attente des messages hors ligne
 * - Actions en attente
 * - Synchronisation automatique
 * - Stockage des paramètres
 *
 * @example
 * ```typescript
 * const offline = useOfflineSupport({
 *   onBackOnline: () => toast.success('Connexion rétablie'),
 *   autoSync: true,
 * });
 *
 * // Enregistrer un message hors ligne
 * await offline.queueMessage(roomId, 'Hello', 'text');
 *
 * // Sauvegarder un paramètre
 * await offline.saveSetting('username', 'John');
 * ```
 */
export function useOfflineSupport(options: UseOfflineSupportOptions = {}): OfflineSupport {
  const { onBackOnline, onGoneOffline, autoSync = true, syncInterval = 0 } = options;

  // Vérifier la disponibilité d'IndexedDB
  const [isSupported, setIsSupported] = useState(() => isIndexedDBAvailable());
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [queuedMessagesCount, setQueuedMessagesCount] = useState(0);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const wasOfflineRef = useRef(!navigator.onLine);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Rafraîchir les statistiques de stockage
   */
  const refreshStats = useCallback(async () => {
    if (!isSupported) return;

    try {
      const stats = await getStorageStats();
      setQueuedMessagesCount(stats.messages);
      setPendingActionsCount(stats.pendingActions);
    } catch (error) {
      console.error('[useOfflineSupport] Erreur lors du rafraîchissement des stats:', error);
    }
  }, [isSupported]);

  /**
   * Enregistrer un message pour envoi différé
   */
  const handleQueueMessage = useCallback(
    async (
      roomId: string,
      content: string,
      type: QueuedMessage['type'] = 'text'
    ): Promise<QueuedMessage | null> => {
      if (!isSupported) {
        console.warn('[useOfflineSupport] IndexedDB non disponible');
        return null;
      }

      try {
        const message = await queueMessage(roomId, content, type);
        await refreshStats();
        return message;
      } catch (error) {
        console.error('[useOfflineSupport] Erreur lors de la mise en file d\'attente:', error);
        return null;
      }
    },
    [isSupported, refreshStats]
  );

  /**
   * Ajouter une action en attente
   */
  const handleAddPendingAction = useCallback(
    async (type: PendingAction['type'], payload: unknown): Promise<PendingAction | null> => {
      if (!isSupported) {
        console.warn('[useOfflineSupport] IndexedDB non disponible');
        return null;
      }

      try {
        const action = await addPendingAction(type, payload);
        await refreshStats();
        return action;
      } catch (error) {
        console.error('[useOfflineSupport] Erreur lors de l\'ajout de l\'action:', error);
        return null;
      }
    },
    [isSupported, refreshStats]
  );

  /**
   * Synchroniser les données en attente
   */
  const syncPendingData = useCallback(async () => {
    if (!isSupported || isSyncing) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      // Récupérer les messages en attente
      const messages = await getQueuedMessages();
      const actions = await getPendingActions();

      // TODO: Implémenter la logique de synchronisation avec le serveur/P2P
      // Pour l'instant, on simule une synchronisation réussie

      // Marquer les messages comme synchronisés
      for (const message of messages) {
        if (message.retryCount < message.maxRetries) {
          // Simuler l'envoi réussi
          await removeQueuedMessage(message.id);
        }
      }

      // Traiter les actions en attente
      for (const action of actions) {
        // Simuler le traitement réussi
        await removePendingAction(action.id);
      }

      setLastSyncTime(new Date());
      await refreshStats();
    } catch (error) {
      console.error('[useOfflineSupport] Erreur de synchronisation:', error);
      setSyncError(error instanceof Error ? error.message : 'Erreur de synchronisation');
    } finally {
      setIsSyncing(false);
    }
  }, [isSupported, isSyncing, refreshStats]);

  /**
   * Sauvegarder un paramètre
   */
  const handleSaveSetting = useCallback(
    async <T,>(key: string, value: T): Promise<void> => {
      if (!isSupported) return;

      try {
        await saveSetting(key, value);
      } catch (error) {
        console.error('[useOfflineSupport] Erreur lors de la sauvegarde:', error);
      }
    },
    [isSupported]
  );

  /**
   * Récupérer un paramètre
   */
  const handleGetSetting = useCallback(
    async <T,>(key: string, defaultValue?: T): Promise<T | undefined> => {
      if (!isSupported) return defaultValue;

      try {
        return await getSetting<T>(key, defaultValue);
      } catch (error) {
        console.error('[useOfflineSupport] Erreur lors de la récupération:', error);
        return defaultValue;
      }
    },
    [isSupported]
  );

  /**
   * Effacer toutes les données offline
   */
  const clearOfflineData = useCallback(async (): Promise<void> => {
    if (!isSupported) return;

    try {
      const { clearAllOfflineData } = await import('@/utils/offlineStorage');
      await clearAllOfflineData();
      await refreshStats();
    } catch (error) {
      console.error('[useOfflineSupport] Erreur lors de la suppression:', error);
    }
  }, [isSupported, refreshStats]);

  // Écouter les changements de connexion
  useEffect(() => {
    const handleOnline = () => {
      console.log('[useOfflineSupport] Connexion rétablie');
      setIsOffline(false);

      if (wasOfflineRef.current && autoSync) {
        // Synchroniser automatiquement au retour en ligne
        syncPendingData();
      }

      wasOfflineRef.current = false;
      onBackOnline?.();
    };

    const handleOffline = () => {
      console.log('[useOfflineSupport] Connexion perdue');
      setIsOffline(true);
      wasOfflineRef.current = true;
      onGoneOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Vérifier l'état initial
    if (navigator.onLine && wasOfflineRef.current) {
      handleOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoSync, onBackOnline, onGoneOffline, syncPendingData]);

  // Synchronisation périodique
  useEffect(() => {
    if (syncInterval > 0 && !isOffline) {
      syncIntervalRef.current = setInterval(() => {
        if (queuedMessagesCount > 0 || pendingActionsCount > 0) {
          syncPendingData();
        }
      }, syncInterval);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncInterval, isOffline, queuedMessagesCount, pendingActionsCount, syncPendingData]);

  // Rafraîchir les statistiques au montage
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return {
    // State
    isSupported,
    isOffline,
    queuedMessagesCount,
    pendingActionsCount,
    isSyncing,
    lastSyncTime,
    syncError,
    // Actions
    queueMessage: handleQueueMessage,
    addPendingAction: handleAddPendingAction,
    syncPendingData,
    saveSetting: handleSaveSetting,
    getSetting: handleGetSetting,
    clearOfflineData,
    refreshStats,
  };
}

/**
 * Hook simplifié pour vérifier si on est hors ligne
 * et obtenir des informations basiques
 */
export function useOfflineStatus(): {
  isOffline: boolean;
  isSupported: boolean;
  hasPendingData: boolean;
} {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [hasPendingData, setHasPendingData] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Vérifier s'il y a des données en attente
    const checkPendingData = async () => {
      if (isIndexedDBAvailable()) {
        try {
          const stats = await getStorageStats();
          setHasPendingData(stats.messages > 0 || stats.pendingActions > 0);
        } catch {
          setHasPendingData(false);
        }
      }
    };

    checkPendingData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOffline,
    isSupported: isIndexedDBAvailable(),
    hasPendingData,
  };
}

/**
 * Hook pour gérer la file d'attente des messages d'une room spécifique
 */
export function useRoomMessageQueue(roomId: string): {
  messages: QueuedMessage[];
  addMessage: (content: string, type?: QueuedMessage['type']) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  clearMessages: () => Promise<void>;
  isLoading: boolean;
} {
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await getQueuedMessages(roomId);
      setMessages(msgs);
    } catch (error) {
      console.error('[useRoomMessageQueue] Erreur de chargement:', error);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const addMessage = useCallback(
    async (content: string, type: QueuedMessage['type'] = 'text') => {
      try {
        await queueMessage(roomId, content, type);
        await loadMessages();
      } catch (error) {
        console.error('[useRoomMessageQueue] Erreur d\'ajout:', error);
      }
    },
    [roomId, loadMessages]
  );

  const removeMessage = useCallback(
    async (messageId: string) => {
      try {
        await removeQueuedMessage(messageId);
        await loadMessages();
      } catch (error) {
        console.error('[useRoomMessageQueue] Erreur de suppression:', error);
      }
    },
    [loadMessages]
  );

  const clearMessages = useCallback(async () => {
    try {
      const msgs = await getQueuedMessages(roomId);
      await Promise.all(msgs.map((m) => removeQueuedMessage(m.id)));
      await loadMessages();
    } catch (error) {
      console.error('[useRoomMessageQueue] Erreur de vidage:', error);
    }
  }, [roomId, loadMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return {
    messages,
    addMessage,
    removeMessage,
    clearMessages,
    isLoading,
  };
}

export default useOfflineSupport;
