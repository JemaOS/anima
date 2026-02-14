// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

/**
 * Retry utility functions for handling transient failures
 * 
 * Features:
 * - Exponential backoff
 * - Configurable max retries and delays
 * - Abort signal support
 * - Custom retry condition functions
 * - Timeout handling
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
  /** Timeout for each attempt in milliseconds */
  timeout?: number;
  /** Jitter factor to add randomness to delays (0-1) */
  jitter?: number;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly totalTime: number
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'signal' | 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  timeout: 30000,
  jitter: 0.1,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: number
): number {
  // Calculate exponential delay
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter to prevent thundering herd
  if (jitter > 0) {
    const jitterAmount = cappedDelay * jitter;
    return cappedDelay + (Math.random() * jitterAmount * 2 - jitterAmount);
  }
  
  return cappedDelay;
}

/**
 * Sleep for a given duration, respecting abort signal
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Retry aborted'));
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const abortHandler = () => {
      cleanup();
      reject(new Error('Retry aborted'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
    };

    signal?.addEventListener('abort', abortHandler);
  });
}

/**
 * Execute a function with a timeout
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const abortHandler = () => {
      cleanup();
      reject(new Error('Operation aborted'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
    };

    signal?.addEventListener('abort', abortHandler);

    fn()
      .then((result) => {
        cleanup();
        resolve(result);
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

/**
 * Default retry condition - retry on network errors and certain status codes
 */
function defaultShouldRetry(error: Error): boolean {
  // Retry on network-related errors
  const retryableErrors = [
    'network',
    'timeout',
    'connection',
    'abort',
    'unavailable',
    'disconnected',
    'failed',
  ];

  const errorMessage = error.message.toLowerCase();
  
  // Check if error message contains retryable keywords
  if (retryableErrors.some(keyword => errorMessage.includes(keyword))) {
    return true;
  }

  // Retry on specific error types
  if (error.name === 'NetworkError' || 
      error.name === 'TimeoutError' ||
      error.name === 'AbortError') {
    return true;
  }

  return false;
}

async function attemptOperation<T>(
  fn: () => Promise<T>,
  timeout: number,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Retry aborted');
  }

  return timeout > 0
    ? await withTimeout(fn, timeout, signal)
    : await fn();
}

async function waitBeforeRetry(
  attempt: number,
  opts: {
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: number;
    signal?: AbortSignal;
    onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
  },
  lastError: Error
) {
  const nextDelay = calculateDelay(
    attempt,
    opts.initialDelay,
    opts.maxDelay,
    opts.backoffMultiplier,
    opts.jitter
  );

  opts.onRetry?.(lastError, attempt + 1, nextDelay);
  await sleep(nextDelay, opts.signal);
}

async function checkAndDelayRetry(
  attempt: number,
  error: Error,
  opts: Required<Omit<RetryOptions, 'signal' | 'shouldRetry' | 'onRetry'>> & {
    signal?: AbortSignal;
    shouldRetry: (error: Error, attempt: number) => boolean;
    onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
  },
) {
  if (attempt >= opts.maxRetries) {
    return;
  }

  if (!opts.shouldRetry(error, attempt)) {
    throw error;
  }

  await waitBeforeRetry(attempt, opts, error);
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws RetryError if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetchData(),
 *   { maxRetries: 5, initialDelay: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const shouldRetry = opts.shouldRetry || defaultShouldRetry;
  const fullOpts = { ...opts, shouldRetry };

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await attemptOperation(fn, opts.timeout, opts.signal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await checkAndDelayRetry(attempt, lastError, fullOpts);
    }
  }

  // All retries exhausted
  const totalTime = Date.now() - startTime;
  throw new RetryError(
    `Failed after ${opts.maxRetries + 1} attempts: ${lastError.message}`,
    opts.maxRetries + 1,
    lastError,
    totalTime,
  );
}

/**
 * Retry a function and return detailed result information
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const wrappedFn = async (): Promise<T> => {
    attempts++;
    return fn();
  };

  const result = await retry(wrappedFn, options);

  return {
    result,
    attempts,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Create a retryable version of a function
 * 
 * @example
 * ```typescript
 * const fetchWithRetry = retryable(fetch, { maxRetries: 3 });
 * const response = await fetchWithRetry('/api/data');
 * ```
 */
export function retryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retry(() => fn(...args), options);
  };
}

/**
 * Debounce function to limit execution rate
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle function to limit execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>): void => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Create a promise that resolves after a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Race a promise against a timeout
 */
export function withTimeoutRace<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Retry configuration presets for common scenarios
 */
export const RetryPresets = {
  /** Fast retries for quick operations */
  fast: {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
  },
  /** Standard retries for API calls */
  standard: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  /** Aggressive retries for critical operations */
  aggressive: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  /** Gentle retries for operations that might take time */
  gentle: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  /** WebRTC connection retries */
  webrtc: {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 16000,
    backoffMultiplier: 2,
    jitter: 0.2,
  },
} as const;

export default retry;
