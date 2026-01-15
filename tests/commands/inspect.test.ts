import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createInspectCommand } from '../../src/commands/inspect.js';
import type { OpItem } from '../../src/utils/types.js';
import type { createSpinner as createSpinnerType } from '../../src/utils/cli.js';

const consoleOutput: string[] = [];

function buildInspectCommand(item: OpItem | null = null) {
  type Spinner = ReturnType<typeof createSpinnerType>;

  return createInspectCommand({
    getItem: () => item,
    checkOpCli: () => {},
    applyColorConfig: () => {},
    createSpinner: (_text: string, _quiet: boolean) =>
      ({
        succeed: () => {},
        fail: () => {},
        stop: () => {},
      }) as Spinner,
    resolveBooleanOption: () => false,
    resolveVault: (v?: string) => v ?? 'Private',
    log: (msg: string) => consoleOutput.push(msg),
  });
}

afterEach(() => {
  consoleOutput.length = 0;
});

test('inspect shows item fields', async () => {
  const mockItem: OpItem = {
    id: '123',
    title: 'GitHub PAT',
    vault: 'Private',
    category: 'API_CREDENTIAL',
    fields: [
      { id: 'token', type: 'CONCEALED', label: 'token', value: 'secret' },
      { id: 'username', type: 'STRING', label: 'username', value: 'user' },
    ],
  };

  const inspectCommand = buildInspectCommand(mockItem);
  await inspectCommand('GitHub PAT', {});

  assert.ok(consoleOutput.some((line) => line.includes('token')));
  assert.ok(consoleOutput.some((line) => line.includes('username')));
});

test('inspect shows item with no fields', async () => {
  const mockItem: OpItem = {
    id: '123',
    title: 'Empty Item',
    vault: 'Private',
    category: 'PASSWORD',
    fields: [],
  };

  const inspectCommand = buildInspectCommand(mockItem);
  await inspectCommand('Empty Item', {});

  assert.ok(consoleOutput.some((line) => line.includes('Empty Item')));
  assert.ok(consoleOutput.some((line) => line.includes('no fields')));
});

test('inspect outputs JSON when --json flag is set', async () => {
  const mockItem: OpItem = {
    id: '123',
    title: 'GitHub PAT',
    vault: 'Private',
    category: 'API_CREDENTIAL',
    fields: [
      { id: 'token', type: 'CONCEALED', label: 'token', value: 'secret' },
    ],
  };

  const inspectCommand = buildInspectCommand(mockItem);
  await inspectCommand('GitHub PAT', { json: true });

  const jsonOutput = consoleOutput.find((line) => line.startsWith('{'));
  assert.ok(jsonOutput, 'Should output JSON');
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.title, 'GitHub PAT');
  assert.equal(parsed.fields.length, 1);
  assert.equal(parsed.fields[0].label, 'token');
  // Value should not be included in JSON output
  assert.equal(parsed.fields[0].value, undefined);
});

test('inspect fails when item not found', async () => {
  const inspectCommand = buildInspectCommand(null);

  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  await assert.rejects(() => inspectCommand('MISSING', {}), /process\.exit/);
  assert.equal(exitCalls[0], 1);

  exitMock.mock.restore();
  errorMock.mock.restore();
});
