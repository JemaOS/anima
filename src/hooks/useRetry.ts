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
          signal: abortControllerRef.current?.signal,
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

// Re-export presets for convenience
export { RetryPresets, RetryError };

// Re-export other hooks
export * from './usePolling';
export * from './useRetryQueue';
