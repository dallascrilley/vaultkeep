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

test('the TTL timer holds the process open so the clear actually fires', async () => {
  // Regression test for the unref()'d timer: with unref() the timer never runs
  // in a one-shot `ops copy`, because nothing else keeps the event loop alive,
  // so the secret stayed on the clipboard past its documented TTL. Under the
  // test runner the callback would still fire either way, so the ref state is
  // asserted directly -- that is the property the documented behavior needs.
  const realSetTimeout = globalThis.setTimeout;
  const handles: NodeJS.Timeout[] = [];
  const timerMock = mock.method(
    globalThis,
    'setTimeout',
    (handler: any, ms?: number, ...rest: any[]) => {
      const handle = realSetTimeout(handler, ms, ...rest);
      handles.push(handle);
      return handle;
    }
  );

  try {
    const copyCommand = buildCopyCommand();
    await copyCommand('MY_SECRET', { ttl: 0.05, quiet: true });

    assert.equal(handles.length, 1, 'expected exactly one TTL timer');
    assert.equal(
      handles[0].hasRef(),
      true,
      'TTL timer must keep the process alive until it fires'
    );

    await new Promise((resolve) => realSetTimeout(resolve, 200));

    assert.deepEqual(
      clipboardWrites,
      ['super-secret', ''],
      'clipboard should be cleared once the real TTL elapses'
    );
  } finally {
    timerMock.mock.restore();
    for (const handle of handles) clearTimeout(handle);
  }
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