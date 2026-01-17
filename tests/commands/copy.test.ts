import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createCopyCommand } from '../../src/commands/copy.js';
import type { createSpinner as createSpinnerType } from '../../src/utils/cli.js';

const clipboardWrites: string[] = [];
const spinnerMessages: string[] = [];
let secretValue: string | null = 'super-secret';
let clipboardValue = '';

function buildCopyCommand() {
  type Spinner = ReturnType<typeof createSpinnerType>;

  return createCopyCommand({
    getSecret: () => secretValue,
    checkOpCli: () => {},
    findSimilarItems: () => [],
    clipboardRead: async () => clipboardValue,
    clipboardWrite: async (value: string) => {
      clipboardValue = value;
      clipboardWrites.push(value);
    },
    applyColorConfig: () => {},
    createSpinner: (_text: string, _quiet: boolean) =>
      ({
      succeed: (message?: string) => {
        if (message) spinnerMessages.push(message);
      },
      fail: (message?: string) => {
        if (message) spinnerMessages.push(message);
      },
    } as Spinner),
    resolveBooleanOption: () => false,
    resolveField: (value?: string) => value ?? 'password',
    resolveVault: (value?: string) => value ?? 'Private',
  });
}

afterEach(() => {
  clipboardWrites.length = 0;
  spinnerMessages.length = 0;
  secretValue = 'super-secret';
  clipboardValue = '';
  mock.timers.reset();
});

test('copies secret to clipboard and clears after default ttl', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const copyCommand = buildCopyCommand();

  await copyCommand('MY_SECRET', {});

  assert.deepEqual(clipboardWrites, ['super-secret']);

  mock.timers.tick(30000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(clipboardWrites, ['super-secret', '']);
  assert.ok(
    spinnerMessages.some((message) => message.includes('Copied to clipboard'))
  );
});

test('copies empty secrets without treating them as missing', async () => {
  secretValue = '';
  const copyCommand = buildCopyCommand();

  await copyCommand('EMPTY_SECRET', {});

  assert.deepEqual(clipboardWrites, ['']);
});

test('exits with error when secret is missing', async () => {
  secretValue = null;
  const copyCommand = buildCopyCommand();

  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  await assert.rejects(() => copyCommand('MISSING', {}), /process\.exit/);
  assert.equal(exitCalls[0], 1);

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('copy logs when clipboard is cleared', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const consoleOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    consoleOutput.push(msg);
  });

  const copyCommand = buildCopyCommand();
  await copyCommand('MY_SECRET', {});

  mock.timers.tick(30000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(
    consoleOutput.some((line) => line.includes('Clipboard cleared')),
    'Should log "Clipboard cleared" after TTL expires'
  );

  logMock.mock.restore();
});