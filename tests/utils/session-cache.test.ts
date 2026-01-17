import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCache } from '../../src/utils/session-cache.js';

function createCache(overrides: Record<string, unknown> = {}) {
  const env: NodeJS.ProcessEnv = {};
  const written: { path?: string; content?: string } = {};

  const cache = createSessionCache({
    env,
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: (path: string, content: string) => {
      written.path = path;
      written.content = content;
    },
    mkdirSync: () => {},
    homedir: () => '/home/user',
    join: (...parts: string[]) => parts.join('/'),
    now: () => '2026-01-17T00:00:00.000Z',
    getConfig: () => ({}),
    ...overrides,
  });

  return { cache, env, written };
}

test('loadSessionCacheIntoEnv sets OP_SESSION vars from cache file', () => {
  const { cache, env } = createCache({
    existsSync: () => true,
    readFileSync: () => '{"sessions":{"OP_SESSION_test":"token"}}',
  });

  cache.loadSessionCacheIntoEnv();

  assert.equal(env.OP_SESSION_test, 'token');
});

test('persistSessionCacheFromEnv writes sessions to cache file', () => {
  const { cache, env, written } = createCache();
  env.OP_SESSION_test = 'token';

  cache.persistSessionCacheFromEnv();

  assert.ok(written.path?.includes('/home/user/.config/ops-cli/session.json'));
  assert.ok(written.content?.includes('OP_SESSION_test'));
});

test('session cache respects OPS_NO_SESSION_CACHE', () => {
  const { cache, env, written } = createCache({
    existsSync: () => true,
    readFileSync: () => '{"sessions":{"OP_SESSION_test":"token"}}',
  });
  env.OPS_NO_SESSION_CACHE = '1';

  cache.loadSessionCacheIntoEnv();
  cache.persistSessionCacheFromEnv();

  assert.equal(env.OP_SESSION_test, undefined);
  assert.equal(written.path, undefined);
});
