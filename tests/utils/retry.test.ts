/**
 * Tests for the retry utility
 */
import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  withRetry,
  withRetrySync,
  isTransientError,
  getDefaultRetryOptions,
  isRetryDisabled,
} from '../../src/utils/retry.js';

describe('isTransientError', () => {
  test('returns true for network errors', () => {
    assert.ok(isTransientError(new Error('network error')));
    assert.ok(isTransientError(new Error('Connection timeout')));
    assert.ok(isTransientError(new Error('ECONNRESET')));
    assert.ok(isTransientError(new Error('ECONNREFUSED')));
    assert.ok(isTransientError(new Error('socket hang up')));
    assert.ok(isTransientError(new Error('ETIMEDOUT')));
  });

  test('returns true for rate limiting errors', () => {
    assert.ok(isTransientError(new Error('rate limit exceeded')));
    assert.ok(isTransientError(new Error('too many requests')));
    assert.ok(isTransientError(new Error('HTTP 429')));
  });

  test('returns true for temporary service errors', () => {
    assert.ok(isTransientError(new Error('service unavailable')));
    assert.ok(isTransientError(new Error('503 Service Temporarily Unavailable')));
    assert.ok(isTransientError(new Error('502 Bad Gateway')));
    assert.ok(isTransientError(new Error('504 Gateway Timeout')));
    assert.ok(isTransientError(new Error('temporarily unavailable')));
  });

  test('returns true for 1Password specific transient errors', () => {
    assert.ok(isTransientError(new Error('session expired')));
    assert.ok(isTransientError(new Error('please try again')));
  });

  test('returns false for non-transient errors', () => {
    assert.ok(!isTransientError(new Error('item not found')));
    assert.ok(!isTransientError(new Error('vault not found')));
    assert.ok(!isTransientError(new Error('permission denied')));
    assert.ok(!isTransientError(new Error('invalid argument')));
  });
});

describe('getDefaultRetryOptions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear retry-related env vars
    delete process.env.OPS_RETRY_COUNT;
    delete process.env.OPS_RETRY_DELAY;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  test('returns default values when no env vars set', () => {
    const options = getDefaultRetryOptions();
    assert.equal(options.maxRetries, 3);
    assert.equal(options.baseDelay, 1000);
    assert.equal(options.multiplier, 2);
  });

  test('respects OPS_RETRY_COUNT env var', () => {
    process.env.OPS_RETRY_COUNT = '5';
    const options = getDefaultRetryOptions();
    assert.equal(options.maxRetries, 5);
  });

  test('respects OPS_RETRY_DELAY env var', () => {
    process.env.OPS_RETRY_DELAY = '2000';
    const options = getDefaultRetryOptions();
    assert.equal(options.baseDelay, 2000);
  });
});

describe('isRetryDisabled', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('returns false when OPS_NO_RETRY is not set', () => {
    delete process.env.OPS_NO_RETRY;
    assert.equal(isRetryDisabled(), false);
  });

  test('returns true when OPS_NO_RETRY is "1"', () => {
    process.env.OPS_NO_RETRY = '1';
    assert.equal(isRetryDisabled(), true);
  });

  test('returns false when OPS_NO_RETRY is other value', () => {
    process.env.OPS_NO_RETRY = 'false';
    assert.equal(isRetryDisabled(), false);
  });
});

describe('withRetry (async)', () => {
  test('returns result on first success', async () => {
    const fn = mock.fn(async () => 'success');
    const result = await withRetry(fn, { maxRetries: 3 });
    assert.equal(result, 'success');
    assert.equal(fn.mock.calls.length, 1);
  });

  test('retries on transient error and succeeds', async () => {
    let attempts = 0;
    const fn = mock.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('network error');
      }
      return 'success';
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10, // Short delay for tests
    });

    assert.equal(result, 'success');
    assert.equal(fn.mock.calls.length, 3);
  });

  test('does not retry non-transient errors', async () => {
    const fn = mock.fn(async () => {
      throw new Error('item not found');
    });

    await assert.rejects(
      () =>
        withRetry(fn, {
          maxRetries: 3,
          baseDelay: 10,
        }),
      { message: 'item not found' }
    );

    assert.equal(fn.mock.calls.length, 1);
  });

  test('throws after max retries exhausted', async () => {
    const fn = mock.fn(async () => {
      throw new Error('network error');
    });

    await assert.rejects(
      () =>
        withRetry(fn, {
          maxRetries: 2,
          baseDelay: 10,
        }),
      { message: 'network error' }
    );

    // Initial attempt + 2 retries = 3 calls
    assert.equal(fn.mock.calls.length, 3);
  });

  test('calls onRetry callback', async () => {
    let attempts = 0;
    const fn = mock.fn(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('network error');
      }
      return 'success';
    });

    const onRetry = mock.fn();

    await withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10,
      onRetry,
    });

    assert.equal(onRetry.mock.calls.length, 1);
    const [attempt, error, delay] = onRetry.mock.calls[0].arguments;
    assert.equal(attempt, 1);
    assert.ok(error instanceof Error);
    assert.ok(delay > 0);
  });

  test('respects custom isRetryable predicate', async () => {
    const fn = mock.fn(async () => {
      throw new Error('custom error');
    });

    await assert.rejects(
      () =>
        withRetry(fn, {
          maxRetries: 3,
          baseDelay: 10,
          isRetryable: (err) => err.message.includes('retry-me'),
        }),
      { message: 'custom error' }
    );

    // Should not retry because isRetryable returns false
    assert.equal(fn.mock.calls.length, 1);
  });

  test('skips retry when OPS_NO_RETRY is set', async () => {
    const originalEnv = process.env.OPS_NO_RETRY;
    process.env.OPS_NO_RETRY = '1';

    const fn = mock.fn(async () => {
      throw new Error('network error');
    });

    try {
      await assert.rejects(() => withRetry(fn, { maxRetries: 3 }), {
        message: 'network error',
      });

      // Should only try once when retry is disabled
      assert.equal(fn.mock.calls.length, 1);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.OPS_NO_RETRY;
      } else {
        process.env.OPS_NO_RETRY = originalEnv;
      }
    }
  });
});

describe('withRetrySync', () => {
  test('returns result on first success', () => {
    const fn = mock.fn(() => 'success');
    const result = withRetrySync(fn, { maxRetries: 3 });
    assert.equal(result, 'success');
    assert.equal(fn.mock.calls.length, 1);
  });

  test('retries on transient error and succeeds', () => {
    let attempts = 0;
    const fn = mock.fn(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error('network error');
      }
      return 'success';
    });

    const result = withRetrySync(fn, {
      maxRetries: 3,
      baseDelay: 1, // Minimal delay for tests
    });

    assert.equal(result, 'success');
    assert.equal(fn.mock.calls.length, 3);
  });

  test('does not retry non-transient errors', () => {
    const fn = mock.fn(() => {
      throw new Error('item not found');
    });

    assert.throws(
      () =>
        withRetrySync(fn, {
          maxRetries: 3,
          baseDelay: 1,
        }),
      { message: 'item not found' }
    );

    assert.equal(fn.mock.calls.length, 1);
  });

  test('throws after max retries exhausted', () => {
    const fn = mock.fn(() => {
      throw new Error('network error');
    });

    assert.throws(
      () =>
        withRetrySync(fn, {
          maxRetries: 2,
          baseDelay: 1,
        }),
      { message: 'network error' }
    );

    // Initial attempt + 2 retries = 3 calls
    assert.equal(fn.mock.calls.length, 3);
  });
});
