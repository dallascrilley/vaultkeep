import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createGetCommand } from '../../src/commands/get.js';

const consoleOutput: string[] = [];
let secretValue: string | null = null;
let itemExists = true;
let itemFields: string[] = ['token', 'username', 'notes'];

function buildGetCommand() {
  return createGetCommand({
    getSecret: () => secretValue,
    setSecret: () => {},
    checkOpCli: () => {},
    itemExists: () => itemExists,
    getItemFields: () => itemFields,
    prompt: async () => ({ create: false }),
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: (msg?: string) => { if (msg) consoleOutput.push(msg); },
      stop: () => {},
    }) as any,
    isInteractiveInput: () => false,
    resolveBooleanOption: () => false,
    resolveField: (v?: string) => v ?? 'password',
    resolveVault: (v?: string) => v ?? 'Private',
  });
}

afterEach(() => {
  consoleOutput.length = 0;
  secretValue = null;
  itemExists = true;
  itemFields = ['token', 'username', 'notes'];
});

test('suggests available fields when field not found', async () => {
  secretValue = null;
  itemExists = true;
  itemFields = ['token', 'credential', 'notes'];

  const getCommand = buildGetCommand();

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });

  await assert.rejects(() => getCommand('GitHub PAT', {}), /process\.exit/);

  // Should suggest available fields
  const allOutput = [...consoleOutput, ...errorOutput].join(' ');
  assert.ok(
    allOutput.includes('token') || allOutput.includes('Available fields'),
    `Expected field suggestions in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('suggests try command with first available field', async () => {
  secretValue = null;
  itemExists = true;
  itemFields = ['api-key', 'secret', 'notes'];

  const getCommand = buildGetCommand();

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });

  await assert.rejects(() => getCommand('My Secret', {}), /process\.exit/);

  const allOutput = [...consoleOutput, ...errorOutput].join(' ');
  assert.ok(
    allOutput.includes('ops get') && allOutput.includes('--field'),
    `Expected try command suggestion in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('suggests inspect command when no fields available', async () => {
  secretValue = null;
  itemExists = true;
  itemFields = [];

  const getCommand = buildGetCommand();

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });

  await assert.rejects(() => getCommand('Empty Item', {}), /process\.exit/);

  const allOutput = [...consoleOutput, ...errorOutput].join(' ');
  assert.ok(
    allOutput.includes('ops inspect'),
    `Expected inspect suggestion in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('retrieves secret successfully when it exists', async () => {
  secretValue = 'my-secret-value';
  const getCommand = buildGetCommand();
  const logOutput: string[] = [];

  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  await getCommand('My Secret', {});

  assert.ok(
    logOutput.some((msg) => msg.includes('my-secret-value')),
    'Expected secret value in output'
  );

  logMock.mock.restore();
});

test('suggests similar secret names when not found', async () => {
  secretValue = null;
  itemExists = false;

  const getCommand = createGetCommand({
    getSecret: () => null,
    setSecret: () => {},
    checkOpCli: () => {},
    itemExists: () => false,
    getItemFields: () => [],
    findSimilarItems: () => ['GITHUB_TOKEN', 'GITHUB_PAT'],
    prompt: async () => ({ create: false }),
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: (msg?: string) => { if (msg) consoleOutput.push(msg); },
      stop: () => {},
    }) as any,
    isInteractiveInput: () => false,
    resolveBooleanOption: () => false,
    resolveField: (v?: string) => v ?? 'password',
    resolveVault: (v?: string) => v ?? 'Private',
  });

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const logOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  // Typo: GITUB instead of GITHUB
  await assert.rejects(() => getCommand('GITUB_TOKEN', {}), /process\.exit/);

  const allOutput = [...consoleOutput, ...errorOutput, ...logOutput].join(' ');
  assert.ok(
    allOutput.includes('GITHUB_TOKEN') || allOutput.includes('Did you mean'),
    `Expected suggestions in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
  logMock.mock.restore();
});
