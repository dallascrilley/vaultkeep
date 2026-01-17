import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfigLoader } from '../../src/utils/config.js';

function createLoaderWithFiles(files: Record<string, string>) {
  return createConfigLoader({
    existsSync: (path: string) => path in files,
    readFileSync: (path: string) => files[path] ?? '',
    cwd: () => '/repo',
    homedir: () => '/home/user',
  });
}

test('config loader merges home and local configs with local override', () => {
  const loadConfig = createLoaderWithFiles({
    '/home/user/.opsrc': '{"vault":"Home","field":"password"}',
    '/repo/.opsrc': '{"vault":"Work"}',
  });

  const config = loadConfig();

  assert.equal(config.vault, 'Work');
  assert.equal(config.field, 'password');
});

test('config loader respects OPS_CONFIG explicit path', () => {
  const original = process.env.OPS_CONFIG;
  process.env.OPS_CONFIG = '/custom/opsrc';

  const loadConfig = createConfigLoader({
    existsSync: (path: string) => path === '/custom/opsrc',
    readFileSync: () => '{"vault":"Explicit"}',
    cwd: () => '/repo',
    homedir: () => '/home/user',
  });

  const config = loadConfig();

  assert.equal(config.vault, 'Explicit');

  if (original === undefined) {
    delete process.env.OPS_CONFIG;
  } else {
    process.env.OPS_CONFIG = original;
  }
});
