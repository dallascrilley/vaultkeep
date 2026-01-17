import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createInteractiveCommand } from '../../src/commands/interactive.js';
import type { OpItem } from '../../src/utils/types.js';
import type { OpVault } from '../../src/utils/op.js';

const vaults: OpVault[] = [
  { id: 'vault-1', name: 'Work', type: 'USER' },
];

const items: OpItem[] = [
  {
    id: 'item-1',
    title: 'API_KEY',
    vault: 'Work',
    category: 'API_CREDENTIAL',
    fields: [{ id: 'field-1', type: 'STRING', label: 'credential' }],
  },
];

test('interactive mode exits when not running in a TTY', async () => {
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  const interactive = createInteractiveCommand({
    isInteractiveInput: () => false,
    checkOpCli: () => {},
  });

  await assert.rejects(() => interactive({}), /process\.exit/);
  assert.equal(exitCalls[0], 2);

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('interactive mode selects vault and item then runs get action', async () => {
  const responses = [
    { vault: 'Work' },
    { item: 'API_KEY' },
    { action: 'get' },
    { action: 'exit' },
  ];

  const prompt = async () => responses.shift() ?? {};
  const getCalls: Array<{ name: string; options: Record<string, unknown> }> = [];

  const interactive = createInteractiveCommand({
    isInteractiveInput: () => true,
    checkOpCli: () => {},
    listVaults: () => vaults,
    listItems: () => items,
    getItem: () => items[0],
    prompt: prompt as any,
    registerPrompt: () => {},
    autocompletePrompt: (() => {}) as any,
    applyColorConfig: () => {},
    resolveBooleanOption: () => false,
    resolveVault: (value?: string) => value ?? 'Work',
    resolveField: (value?: string) => value ?? 'password',
    copyCommand: async () => {},
    getCommand: async (name: string, options: Record<string, unknown>) => {
      getCalls.push({ name, options });
    },
    inspectCommand: async () => {},
  });

  await interactive({});

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].name, 'API_KEY');
  assert.equal(getCalls[0].options.vault, 'Work');
});
