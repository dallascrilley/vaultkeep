/**
 * Retry utility with exponential backoff for transient failures.
 *
 * Environment variables:
 *   OPS_RETRY_COUNT - Max retry attempts (default: 3)
 *   OPS_RETRY_DELAY - Base delay in ms (default: 1000)
 *   OPS_NO_RETRY    - Disable retry entirely if set to "1"
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  multiplier?: number;
  /** Optional callback when a retry occurs */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Predicate to determine if an error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Default retry options from environment or sensible defaults
 */
export function getDefaultRetryOptions(): RetryOptions {
  const envRetryCount = process.env.OPS_RETRY_COUNT;
  const envRetryDelay = process.env.OPS_RETRY_DELAY;

  return {
    maxRetries: envRetryCount ? parseInt(envRetryCount, 10) : 3,
    baseDelay: envRetryDelay ? parseInt(envRetryDelay, 10) : 1000,
    multiplier: 2,
    isRetryable: isTransientError,
  };
}

/**
 * Check if retry is disabled via environment variable
 */
export function isRetryDisabled(): boolean {
  return process.env.OPS_NO_RETRY === '1';
}

/**
 * Determine if an error is likely transient and worth retrying
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network-related errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket') ||
    message.includes('etimedout')
  ) {
    return true;
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return true;
  }

  // Temporary service issues
  if (
    message.includes('service unavailable') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('temporarily')
  ) {
    return true;
  }

  // 1Password specific transient errors
  if (
    message.includes('session expired') ||
    message.includes('try again')
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry logic and exponential backoff.
 *
 * @example
 * const result = await withRetry(
 *   () => fetchSecret(name),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // If retry is disabled globally, just run the function once
  if (isRetryDisabled()) {
    return fn();
  }

  const defaults = getDefaultRetryOptions();
  const {
    maxRetries = defaults.maxRetries ?? 3,
    baseDelay = defaults.baseDelay ?? 1000,
    multiplier = defaults.multiplier ?? 2,
    onRetry,
    isRetryable = defaults.isRetryable ?? isTransientError,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Don't retry non-retryable errors
      if (!isRetryable(err)) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delayMs = Math.floor(exponentialDelay + jitter);

      // Notify about retry if callback provided
      if (onRetry) {
        onRetry(attempt + 1, err, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Execute a sync function with retry logic (for subprocess calls).
 * Note: This uses blocking sleeps which is acceptable for CLI usage.
 *
 * @example
 * const result = withRetrySync(
 *   () => execSync('op item get ...'),
 *   { maxRetries: 3 }
 * );
 */
export function withRetrySync<T>(
  fn: () => T,
  options: RetryOptions = {}
): T {
  // If retry is disabled globally, just run the function once
  if (isRetryDisabled()) {
    return fn();
  }

  const defaults = getDefaultRetryOptions();
  const {
    maxRetries = defaults.maxRetries ?? 3,
    baseDelay = defaults.baseDelay ?? 1000,
    multiplier = defaults.multiplier ?? 2,
    onRetry,
    isRetryable = defaults.isRetryable ?? isTransientError,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Don't retry non-retryable errors
      if (!isRetryable(err)) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay;
      const delayMs = Math.floor(exponentialDelay + jitter);

      // Notify about retry if callback provided
      if (onRetry) {
        onRetry(attempt + 1, err, delayMs);
      }

      // Blocking sleep for sync operations
      const end = Date.now() + delayMs;
      while (Date.now() < end) {
        // Busy wait - acceptable for CLI
      }
    }
  }

  throw lastError;
}
