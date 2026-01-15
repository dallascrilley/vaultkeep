import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createVaultsCommand } from '../../src/commands/vaults.js';

const consoleOutput: string[] = [];

interface MockVault {
  id: string;
  name: string;
  type: string;
}

let mockVaults: MockVault[] = [
  { id: '1', name: 'Private', type: 'USER_CREATED' },
  { id: '2', name: 'Work', type: 'SHARED' },
];

function buildVaultsCommand() {
  return createVaultsCommand({
    listVaults: () => mockVaults,
    checkOpCli: () => {},
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    }) as any,
    resolveBooleanOption: () => false,
    log: (msg: string) => consoleOutput.push(msg),
  });
}

afterEach(() => {
  consoleOutput.length = 0;
  mockVaults = [
    { id: '1', name: 'Private', type: 'USER_CREATED' },
    { id: '2', name: 'Work', type: 'SHARED' },
  ];
});

test('vaults lists available vaults', async () => {
  const vaultsCommand = buildVaultsCommand();
  await vaultsCommand({});

  assert.ok(consoleOutput.some((line) => line.includes('Private')));
  assert.ok(consoleOutput.some((line) => line.includes('Work')));
});

test('vaults outputs JSON when --json flag is set', async () => {
  const vaultsCommand = buildVaultsCommand();
  await vaultsCommand({ json: true });

  const jsonOutput = consoleOutput.find((line) => line.startsWith('['));
  assert.ok(jsonOutput, 'Should output JSON array');
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.length, 2);
});

test('vaults handles empty vault list', async () => {
  mockVaults = [];
  const vaultsCommand = buildVaultsCommand();
  await vaultsCommand({});

  assert.ok(consoleOutput.some((line) => line.includes('No vaults found')));
});
