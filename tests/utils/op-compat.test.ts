import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpCompatRoute } from '../../src/utils/op-compat.js';

test('routes empty argv to ops', () => {
  assert.deepEqual(resolveOpCompatRoute([]), { route: 'ops' });
});

test('routes unknown top-level commands to op', () => {
  assert.deepEqual(resolveOpCompatRoute(['item', 'list']), {
    route: 'op',
    opArgs: ['item', 'list'],
  });
});

test('routes internal commands to ops', () => {
  assert.deepEqual(resolveOpCompatRoute(['get', 'MY_SECRET']), { route: 'ops' });
  assert.deepEqual(resolveOpCompatRoute(['run', '--', 'node', 'app.js']), { route: 'ops' });
});

test('routes explicit passthrough via ops op', () => {
  assert.deepEqual(resolveOpCompatRoute(['op', 'vault', 'list']), {
    route: 'op',
    opArgs: ['vault', 'list'],
  });
});

test('routes template subcommands to ops, unknown template subcommands to op', () => {
  assert.deepEqual(resolveOpCompatRoute(['template', 'list']), { route: 'ops' });
  assert.deepEqual(resolveOpCompatRoute(['template', 'apply', 'postgres']), { route: 'ops' });

  assert.deepEqual(resolveOpCompatRoute(['template', 'get', 'Login']), {
    route: 'op',
    opArgs: ['template', 'get', 'Login'],
  });
});

test('routes op-style global options to op', () => {
  assert.deepEqual(resolveOpCompatRoute(['--account', 'my', 'item', 'list']), {
    route: 'op',
    opArgs: ['--account', 'my', 'item', 'list'],
  });
});

test('routes ops global options + op command to op (stripping ops options)', () => {
  assert.deepEqual(resolveOpCompatRoute(['--retry', '5', 'item', 'list']), {
    route: 'op',
    opArgs: ['item', 'list'],
  });
});

test('does not treat option values as commands (e.g. --vault Work get ...)', () => {
  assert.deepEqual(resolveOpCompatRoute(['--vault', 'Work', 'get', 'MY_SECRET']), {
    route: 'ops',
  });
});
