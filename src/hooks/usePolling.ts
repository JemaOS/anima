import { useState, useCallback, useRef, useEffect } from 'react';
import { useRetry, UseRetryOptions, UseRetryState, UseRetryActions } from './useRetry';

/**
 * Hook for polling with retry logic
 * Automatically retries failed polls and continues polling
 */
export interface UsePollingOptions<T> extends UseRetryOptions<T> {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether to start polling immediately */
  enabled?: boolean;
  /** Continue polling even on error */
  continueOnError?: boolean;
  /** Maximum number of consecutive errors before stopping */
  maxConsecutiveErrors?: number;
}

export interface UsePollingState<T> extends UseRetryState<T> {
  /** Whether polling is active */
  isPolling: boolean;
  /** Number of consecutive errors */
  consecutiveErrors: number;
  /** Time until next poll */
  timeUntilNextPoll: number;
}

export interface UsePollingActions<T> extends UseRetryActions<T> {
  /** Start polling */
  start: () => void;
  /** Stop polling */
  stop: () => void;
}

export function usePolling<T>(
  options: UsePollingOptions<T>
): UsePollingState<T> & UsePollingActions<T> {
  const {
    interval,
    enabled = true,
    continueOnError = true,
    maxConsecutiveErrors = 5,
    ...retryOptions
  } = options;

  const [isPolling, setIsPolling] = useState(enabled);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [timeUntilNextPoll, setTimeUntilNextPoll] = useState(interval);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data,
    isLoading,
    error,
    attempts,
    isRetrying,
    execute,
    reset,
    cancel,
  } = useRetry({
    ...retryOptions,
    immediate: false,
  });

  const stop = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    cancel();
  }, [cancel]);

  const start = useCallback(() => {
    if (isPolling) return;
    
    setIsPolling(true);
    setConsecutiveErrors(0);
    
    // Execute immediately
    execute().catch(() => {
      // Error handled by useRetry
    });

    // Set up countdown
    let remaining = interval;
    setTimeUntilNextPoll(remaining);
    
    countdownRef.current = setInterval(() => {
      remaining -= 100;
      setTimeUntilNextPoll(Math.max(0, remaining));
      if (remaining <= 0) {
        remaining = interval;
      }
    }, 100);

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      if (consecutiveErrors >= maxConsecutiveErrors) {
        stop();
        return;
      }

      execute().catch(() => {
        // Error handled by useRetry
      });
    }, interval);
  }, [isPolling, interval, execute, consecutiveErrors, maxConsecutiveErrors, stop]);

  // Track consecutive errors
  useEffect(() => {
    if (error) {
      setConsecutiveErrors(prev => prev + 1);
    } else if (data) {
      setConsecutiveErrors(0);
    }
  }, [error, data]);

  // Start/stop based on enabled prop
  useEffect(() => {
    if (enabled && !isPolling) {
      start();
    } else if (!enabled && isPolling) {
      stop();
    }
  }, [enabled, isPolling, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    data,
    isLoading,
    error,
    attempts,
    isRetrying,
    isPolling,
    consecutiveErrors,
    timeUntilNextPoll,
    execute,
    reset,
    retry: execute,
    cancel,
    start,
    stop,
  };
}