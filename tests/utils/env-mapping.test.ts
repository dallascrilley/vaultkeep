import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvMappingFile } from '../../src/utils/env-mapping.js';

const noopParser = () => ({}) as Record<string, string>;

test('loadEnvMappingFile returns empty object when file is missing', () => {
  const mapping = loadEnvMappingFile('.env.ops', {
    existsSync: () => false,
    readFileSync: () => '',
    parseEnv: noopParser,
  });

  assert.deepEqual(mapping, {});
});

test('loadEnvMappingFile parses env mapping content', () => {
  const mapping = loadEnvMappingFile('.env.ops', {
    existsSync: () => true,
    readFileSync: () => 'API_KEY=MY_SECRET',
    parseEnv: () => ({ API_KEY: 'MY_SECRET' }),
  });

  assert.deepEqual(mapping, { API_KEY: 'MY_SECRET' });
});

test('loadEnvMappingFile validates JSON mapping values are strings', () => {
  assert.throws(
    () =>
      loadEnvMappingFile('.env.ops.json', {
        existsSync: () => true,
        readFileSync: () => '{"API_KEY": 123}',
        parseEnv: noopParser,
      }),
    /Invalid env mapping file/
  );
});
