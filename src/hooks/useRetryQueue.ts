import { useState, useCallback, useRef } from 'react';
import { retry, RetryOptions } from '@/utils/retry';

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

  const updateQueueItem = useCallback((id: string, updates: Partial<RetryQueueItem<T>>) => {
    setQueue(prev => prev.map(q => (q.id === id ? { ...q, ...updates } : q)));
  }, []);

  const processItem = useCallback(async (item: RetryQueueItem<T>) => {
    updateQueueItem(item.id, { status: 'running' });

    try {
      const result = await retry(item.fn, {
        ...retryOptions,
        signal: abortControllerRef.current?.signal,
        onRetry: (error, attempt) => {
          updateQueueItem(item.id, { attempts: attempt });
        },
      });

      updateQueueItem(item.id, { status: 'completed', result });
      return { id: item.id, success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      updateQueueItem(item.id, { status: 'failed', error: err });
      return { id: item.id, success: false };
    }
  }, [retryOptions, updateQueueItem]);

  const processBatch = useCallback(async (batch: RetryQueueItem<T>[]) => {
    return Promise.allSettled(batch.map(item => processItem(item)));
  }, [processItem]);

  const process = useCallback(async (): Promise<void> => {
    if (isProcessing) return;

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    const pending = queue.filter(item => item.status === 'pending');
    
    for (let i = 0; i < pending.length; i += concurrency) {
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      const batch = pending.slice(i, i + concurrency);
      const results = await processBatch(batch);

      // Check if we should stop on error
      if (stopOnError && results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success))) {
        break;
      }
    }

    setIsProcessing(false);
  }, [queue, isProcessing, concurrency, stopOnError, processBatch]);

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