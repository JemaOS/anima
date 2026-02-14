// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useEffect, useCallback, useRef } from 'react';

const getNavigatorConnection = () => {
  if (typeof navigator === 'undefined') return null;
  return (navigator as any).connection ||
         (navigator as any).mozConnection ||
         (navigator as any).webkitConnection;
};

export type NetworkState = 'online' | 'offline' | 'unknown';
export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'unknown';

export interface NetworkStatus {
  /** Whether the browser is online */
  isOnline: boolean;
  /** Current network state */
  state: NetworkState;
  /** Estimated effective connection type */
  connectionType: ConnectionType;
  /** Estimated effective bandwidth in Mbps (if available) */
  downlink: number | null;
  /** Estimated round-trip time in ms (if available) */
  rtt: number | null;
  /** Whether the connection is using data saver mode */
  saveData: boolean;
  /** Timestamp of last online/offline change */
  lastChanged: Date;
  /** Whether the network was recently restored */
  wasRecentlyOffline: boolean;
}

export interface UseNetworkStatusOptions {
  /** Callback when network goes online */
  onOnline?: () => void;
  /** Callback when network goes offline */
  onOffline?: () => void;
  /** Callback when connection quality changes significantly */
  onConnectionChange?: (status: NetworkStatus) => void;
  /** Polling interval for connection quality checks (ms) */
  pollInterval?: number;
}

/**
 * Hook to monitor network status and connection quality
 * 
 * Features:
 * - Online/offline detection
 * - Connection quality monitoring (if Network Information API is available)
 * - Reconnection callbacks
 * - Polling for connection changes
 * 
 * @example
 * ```typescript
 * const network = useNetworkStatus({
 *   onOnline: () => console.log('Back online!'),
 *   onOffline: () => console.log('Gone offline'),
 * });
 * 
 * if (!network.isOnline) {
 *   return <OfflineMessage />;
 * }
 * ```
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}): NetworkStatus {
  const { onOnline, onOffline, onConnectionChange, pollInterval = 5000 } = options;
  
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    state: navigator.onLine ? 'online' : 'offline',
    connectionType: 'unknown',
    downlink: null,
    rtt: null,
    saveData: false,
    lastChanged: new Date(),
    wasRecentlyOffline: false,
  });

  const previousOnlineRef = useRef(navigator.onLine);
  const offlineStartTimeRef = useRef<Date | null>(null);

  /**
   * Get connection info from Network Information API
   */
  const getConnectionInfo = useCallback(() => {
    const connection = getNavigatorConnection();

    if (!connection) {
      return {
        connectionType: 'unknown' as ConnectionType,
        downlink: null,
        rtt: null,
        saveData: false,
      };
    }

    const type = connection.effectiveType || connection.type;
    let connectionType: ConnectionType = 'unknown';

    if (type === 'wifi' || type === 'wimax') {
      connectionType = 'wifi';
    } else if (type === 'cellular' || type === '2g' || type === '3g' || type === '4g') {
      connectionType = 'cellular';
    } else if (type === 'ethernet') {
      connectionType = 'ethernet';
    }

    return {
      connectionType,
      downlink: connection.downlink || null,
      rtt: connection.rtt || null,
      saveData: connection.saveData || false,
    };
  }, []);

  /**
   * Update network status
   */
  const updateStatus = useCallback(() => {
    const isOnline = navigator.onLine;
    const connectionInfo = getConnectionInfo();
    
    setStatus(prev => {
      const wasOffline = !prev.isOnline && isOnline;
      const now = new Date();

      // Track when we went offline
      if (!isOnline && prev.isOnline) {
        offlineStartTimeRef.current = now;
      }

      // Calculate if we were recently offline (within last 30 seconds)
      const wasRecentlyOffline = wasOffline || 
        (offlineStartTimeRef.current && 
         now.getTime() - offlineStartTimeRef.current.getTime() < 30000);

      // Reset offline tracking when we come back online
      if (isOnline && !prev.isOnline) {
        offlineStartTimeRef.current = null;
      }

      return {
        isOnline,
        state: isOnline ? 'online' : 'offline',
        ...connectionInfo,
        lastChanged: now,
        wasRecentlyOffline,
      };
    });
  }, [getConnectionInfo]);

  // Handle online event
  useEffect(() => {
    const handleOnline = () => {
      updateStatus();
      onOnline?.();
    };

    globalThis.addEventListener('online', handleOnline);
    return () => globalThis.removeEventListener('online', handleOnline);
  }, [onOnline, updateStatus]);

  // Handle offline event
  useEffect(() => {
    const handleOffline = () => {
      updateStatus();
      onOffline?.();
    };

    globalThis.addEventListener('offline', handleOffline);
    return () => globalThis.removeEventListener('offline', handleOffline);
  }, [onOffline, updateStatus]);

  // Poll for connection changes
  useEffect(() => {
    if (pollInterval <= 0) return;

    const intervalId = setInterval(() => {
      const previous = { ...status };
      updateStatus();

      // Check for significant changes
      const current = status;
      const hasChanged = 
        previous.connectionType !== current.connectionType ||
        previous.downlink !== current.downlink ||
        previous.rtt !== current.rtt;

      if (hasChanged) {
        onConnectionChange?.(current);
      }
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [pollInterval, updateStatus, onConnectionChange, status]);

  // Listen for connection change events (Network Information API)
  useEffect(() => {
    const connection = getNavigatorConnection();

    if (connection) {
      const handleChange = () => {
        updateStatus();
        onConnectionChange?.(status);
      };

      connection.addEventListener('change', handleChange);
      return () => connection.removeEventListener('change', handleChange);
    }
  }, [updateStatus, onConnectionChange, status]);

  // Initial status check
  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  return status;
}

/**
 * Hook to check if the user is currently online
 * Simple boolean version of useNetworkStatus
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to monitor connection quality
 * Returns connection quality metrics when available
 */
export function useConnectionQuality(): {
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  downlink: number | null;
  rtt: number | null;
} {
  const [quality, setQuality] = useState<{
    quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    downlink: number | null;
    rtt: number | null;
  }>({
    quality: 'unknown',
    downlink: null,
    rtt: null,
  });

  useEffect(() => {
    const connection = getNavigatorConnection();

    if (!connection) {
      return;
    }

    const calculateQuality = () => {
      const downlink = connection.downlink;
      const rtt = connection.rtt;
      const effectiveType = connection.effectiveType;

      let quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' = 'unknown';

      if (effectiveType === '4g' || (downlink && downlink >= 10)) {
        quality = 'excellent';
      } else if (effectiveType === '3g' || (downlink && downlink >= 1.5)) {
        quality = 'good';
      } else if (effectiveType === '2g' || (downlink && downlink >= 0.1)) {
        quality = 'fair';
      } else if (downlink !== null) {
        quality = 'poor';
      }

      // Adjust based on RTT
      if (rtt && rtt > 500) {
        quality = quality === 'excellent' ? 'good' : 'poor';
      }

      setQuality({ quality, downlink: downlink || null, rtt: rtt || null });
    };

    calculateQuality();

    connection.addEventListener('change', calculateQuality);
    return () => connection.removeEventListener('change', calculateQuality);
  }, []);

  return quality;
}

/**
 * Hook to handle reconnection logic
 * Provides utilities for managing reconnection state
 */
export interface UseReconnectionOptions {
  /** Maximum number of reconnection attempts */
  maxAttempts?: number;
  /** Delay between reconnection attempts (ms) */
  delay?: number;
  /** Whether to start reconnecting immediately when offline */
  autoReconnect?: boolean;
}

export interface ReconnectionState {
  /** Whether currently attempting to reconnect */
  isReconnecting: boolean;
  /** Number of reconnection attempts made */
  attempts: number;
  /** Time until next reconnection attempt */
  timeUntilNextAttempt: number;
  /** Whether reconnection was successful */
  isReconnected: boolean;
  /** Start reconnection process */
  startReconnecting: () => void;
  /** Stop reconnection process */
  stopReconnecting: () => void;
  /** Reset reconnection state */
  reset: () => void;
}

export function useReconnection(
  options: UseReconnectionOptions = {}
): ReconnectionState {
  const { maxAttempts = 5, delay = 3000, autoReconnect = true } = options;
  
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [timeUntilNextAttempt, setTimeUntilNextAttempt] = useState(0);
  const [isReconnected, setIsReconnected] = useState(false);
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopReconnecting = useCallback(() => {
    clearTimers();
    setIsReconnecting(false);
    setTimeUntilNextAttempt(0);
  }, [clearTimers]);

  const reset = useCallback(() => {
    stopReconnecting();
    setAttempts(0);
    setIsReconnected(false);
  }, [stopReconnecting]);

  const startReconnecting = useCallback(() => {
    if (isReconnecting || attempts >= maxAttempts) return;

    setIsReconnecting(true);
    setIsReconnected(false);

    let countdown = delay;
    setTimeUntilNextAttempt(countdown);

    // Countdown interval
    intervalRef.current = setInterval(() => {
      countdown -= 100;
      setTimeUntilNextAttempt(Math.max(0, countdown));
    }, 100);

    // Attempt reconnection after delay
    timeoutRef.current = setTimeout(() => {
      clearTimers();
      setAttempts(prev => prev + 1);
      
      // Check if we're back online
      if (navigator.onLine) {
        setIsReconnected(true);
        setIsReconnecting(false);
      } else if (attempts + 1 < maxAttempts) {
        // Try again
        startReconnecting();
      } else {
        // Max attempts reached
        setIsReconnecting(false);
      }
    }, delay);
  }, [isReconnecting, attempts, maxAttempts, delay, clearTimers]);

  // Auto-reconnect when going offline
  useEffect(() => {
    if (!autoReconnect) return;

    const handleOffline = () => {
      reset();
      startReconnecting();
    };

    const handleOnline = () => {
      if (isReconnecting) {
        stopReconnecting();
        setIsReconnected(true);
      }
    };

    globalThis.addEventListener('offline', handleOffline);
    globalThis.addEventListener('online', handleOnline);

    return () => {
      globalThis.removeEventListener('offline', handleOffline);
      globalThis.removeEventListener('online', handleOnline);
      clearTimers();
    };
  }, [autoReconnect, isReconnecting, reset, startReconnecting, stopReconnecting, clearTimers]);

  return {
    isReconnecting,
    attempts,
    timeUntilNextAttempt,
    isReconnected,
    startReconnecting,
    stopReconnecting,
    reset,
  };
}
