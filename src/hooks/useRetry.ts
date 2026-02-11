// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useCallback, useRef, useEffect } from 'react';
import { retry, RetryOptions, RetryError, RetryPresets } from '@/utils/retry';

export interface UseRetryState<T> {
  /** Current data (null if not yet loaded) */
  data: T | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Error from the last failed attempt */
  error: Error | null;
  /** Number of retry attempts made */
  attempts: number;
  /** Whether currently retrying */
  isRetrying: boolean;
}

export interface UseRetryActions<T> {
  /** Execute the operation */
  execute: (...args: any[]) => Promise<T>;
  /** Reset the state */
  reset: () => void;
  /** Manually trigger a retry */
  retry: () => Promise<T>;
  /** Cancel any pending operation */
  cancel: () => void;
}

export interface UseRetryOptions<T> extends RetryOptions {
  /** Function to execute */
  fn: (...args: any[]) => Promise<T>;
  /** Whether to execute on mount */
  immediate?: boolean;
  /** Initial data */
  initialData?: T;
  /** Callback on success */
  onSuccess?: (data: T) => void;
  /** Callback on error (after all retries exhausted) */
  onError?: (error: Error) => void;
  /** Callback on each retry attempt */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Hook for retrying async operations with state management
 * 
 * @example
 * ```typescript
 * const { data, isLoading, error, execute, retry } = useRetry({
 *   fn: fetchUserData,
 *   maxRetries: 3,
 *   immediate: true,
 * });
 * 
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} onRetry={retry} />;
 * return <UserProfile data={data} />;
 * ```
 */
export function useRetry<T>(options: UseRetryOptions<T>): UseRetryState<T> & UseRetryActions<T> {
  const {
    fn,
    immediate = false,
    initialData = null,
    onSuccess,
    onError,
    onRetry: onRetryCallback,
    ...retryOptions
  } = options;

  const [state, setState] = useState<UseRetryState<T>>({
    data: initialData,
    isLoading: immediate,
    error: null,
    attempts: 0,
    isRetrying: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async (...args: any[]): Promise<T> => {
    // Cancel any pending operation
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isRetrying: false,
    }));

    try {
      const result = await retry(
        () => fn(...args),
        {
          ...retryOptions,
          signal: abortControllerRef.current.signal,
          onRetry: (error, attempt, nextDelay) => {
            if (isMountedRef.current) {
              setState(prev => ({
                ...prev,
                isRetrying: true,
                attempts: attempt,
              }));
              onRetryCallback?.(error, attempt);
            }
          },
        }
      );

      if (isMountedRef.current) {
        setState({
          data: result,
          isLoading: false,
          error: null,
          attempts: 0,
          isRetrying: false,
        });
        onSuccess?.(result);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err,
          isRetrying: false,
        }));
        onError?.(err);
      }

      throw err;
    }
  }, [fn, retryOptions, onSuccess, onError, onRetryCallback]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({
      data: initialData,
      isLoading: false,
      error: null,
      attempts: 0,
      isRetrying: false,
    });
  }, [initialData]);

  const retryOperation = useCallback(async (): Promise<T> => {
    return execute();
  }, [execute]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({
      ...prev,
      isLoading: false,
      isRetrying: false,
    }));
  }, []);

  // Execute on mount if immediate is true
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  return {
    ...state,
    execute,
    reset,
    retry: retryOperation,
    cancel,
  };
}

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

/**
 * Hook for managing a queue of retryable operations
 * Useful for batching operations with retry logic
 */
export interface UseRetryQueueOptions extends RetryOptions {
  /** Maximum concurrent operations */
  concurrency?: number;
  /** Whether to stop on first error */
  stopOnError?: boolean;
}

export interface RetryQueueItem<T> {
  id: string;
  fn: () => Promise<T>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: Error;
  attempts: number;
}

export interface UseRetryQueueState<T> {
  /** Queue of operations */
  queue: RetryQueueItem<T>[];
  /** Whether any operation is running */
  isProcessing: boolean;
  /** Number of completed operations */
  completed: number;
  /** Number of failed operations */
  failed: number;
}

export interface UseRetryQueueActions<T> {
  /** Add an operation to the queue */
  add: (id: string, fn: () => Promise<T>) => void;
  /** Remove an operation from the queue */
  remove: (id: string) => void;
  /** Start processing the queue */
  process: () => Promise<void>;
  /** Clear the queue */
  clear: () => void;
  /** Retry a failed operation */
  retryItem: (id: string) => Promise<void>;
}

export function useRetryQueue<T>(
  options: UseRetryQueueOptions = {}
): UseRetryQueueState<T> & UseRetryQueueActions<T> {
  const { concurrency = 1, stopOnError = false, ...retryOptions } = options;

  const [queue, setQueue] = useState<RetryQueueItem<T>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const add = useCallback((id: string, fn: () => Promise<T>) => {
    setQueue(prev => {
      if (prev.some(item => item.id === id)) {
        return prev; // Don't add duplicates
      }
      return [...prev, { id, fn, status: 'pending', attempts: 0 }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setQueue([]);
    setIsProcessing(false);
  }, []);

  const process = useCallback(async (): Promise<void> => {
    if (isProcessing) return;

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    const pending = queue.filter(item => item.status === 'pending');
    
    for (let i = 0; i < pending.length; i += concurrency) {
      if (abortControllerRef.current.signal.aborted) {
        break;
      }

      const batch = pending.slice(i, i + concurrency);
      
      const results = await Promise.allSettled(
        batch.map(async item => {
          setQueue(prev =>
            prev.map(q =>
              q.id === item.id ? { ...q, status: 'running' } : q
            )
          );

          try {
            const result = await retry(item.fn, {
              ...retryOptions,
              signal: abortControllerRef.current?.signal,
              onRetry: (error, attempt) => {
                setQueue(prev =>
                  prev.map(q =>
                    q.id === item.id ? { ...q, attempts: attempt } : q
                  )
                );
              },
            });

            setQueue(prev =>
              prev.map(q =>
                q.id === item.id
                  ? { ...q, status: 'completed', result }
                  : q
              )
            );

            return { id: item.id, success: true };
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            
            setQueue(prev =>
              prev.map(q =>
                q.id === item.id
                  ? { ...q, status: 'failed', error: err }
                  : q
              )
            );

            return { id: item.id, success: false };
          }
        })
      );

      // Check if we should stop on error
      if (stopOnError && results.some(r => r.status === 'rejected' || !r.value?.success)) {
        break;
      }
    }

    setIsProcessing(false);
  }, [queue, isProcessing, concurrency, stopOnError, retryOptions]);

  const retryItem = useCallback(async (id: string): Promise<void> => {
    const item = queue.find(q => q.id === id);
    if (!item || item.status !== 'failed') return;

    setQueue(prev =>
      prev.map(q =>
        q.id === id ? { ...q, status: 'pending', error: undefined, attempts: 0 } : q
      )
    );

    try {
      const result = await retry(item.fn, retryOptions);
      
      setQueue(prev =>
        prev.map(q =>
          q.id === id ? { ...q, status: 'completed', result } : q
        )
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      setQueue(prev =>
        prev.map(q =>
          q.id === id ? { ...q, status: 'failed', error: err } : q
        )
      );
    }
  }, [queue, retryOptions]);

  const completed = queue.filter(item => item.status === 'completed').length;
  const failed = queue.filter(item => item.status === 'failed').length;

  return {
    queue,
    isProcessing,
    completed,
    failed,
    add,
    remove,
    process,
    clear,
    retryItem,
  };
}

// Re-export presets for convenience
export { RetryPresets, RetryError };

export default useRetry;
