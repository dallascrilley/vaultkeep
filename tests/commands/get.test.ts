import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createGetCommand } from '../../src/commands/get.js';

const consoleOutput: string[] = [];
let secretValue: string | null = null;
let itemExists = true;
let itemFields: string[] = ['token', 'username', 'notes'];
let itemCategory: string | null = null;

function buildGetCommand(overrides: Record<string, any> = {}) {
  return createGetCommand({
    getSecret: () => secretValue,
    setSecret: () => {},
    checkOpCli: () => {},
    itemExists: () => itemExists,
    getItemFields: () => itemFields,
    findSimilarItems: () => [],
    // getItem now returns item with fields for optimized caching
    getItem: () => {
      if (itemExists) {
        return {
          category: itemCategory || 'LOGIN',
          fields: itemFields.map(label => ({ label, value: 'mock-value' })),
        };
      }
      return null;
    },
    getDefaultFieldForCategory: (cat: string) => {
      const defaults: Record<string, string> = {
        API_CREDENTIAL: 'credential',
        LOGIN: 'password',
        SECURE_NOTE: 'notesPlain',
      };
      return defaults[cat] || 'password';
    },
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
    ...overrides,
  });
}

afterEach(() => {
  consoleOutput.length = 0;
  secretValue = null;
  itemExists = true;
  itemFields = ['token', 'username', 'notes'];
  itemCategory = null;
});

test('uses smart field detection for API_CREDENTIAL items', async () => {
  itemCategory = 'API_CREDENTIAL';
  let usedField: string | null = null;
  
  const getCommand = buildGetCommand({
    getSecret: (_name: string, _vault: string, field: string) => {
      usedField = field;
      return 'my-api-key';
    },
  });

  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  // Don't specify --field, should auto-detect 'credential' for API_CREDENTIAL
  await getCommand('My API Key', {});

  assert.equal(usedField, 'credential', 'Should use credential field for API_CREDENTIAL items');

  logMock.mock.restore();
});

test('uses password field for LOGIN items', async () => {
  itemCategory = 'LOGIN';
  let usedField: string | null = null;
  
  const getCommand = buildGetCommand({
    getSecret: (_name: string, _vault: string, field: string) => {
      usedField = field;
      return 'my-password';
    },
  });

  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  await getCommand('My Login', {});

  assert.equal(usedField, 'password', 'Should use password field for LOGIN items');

  logMock.mock.restore();
});

test('respects explicit --field option over smart detection', async () => {
  itemCategory = 'API_CREDENTIAL';
  let usedField: string | null = null;

  const getCommand = buildGetCommand({
    // Cached item doesn't include 'token' field, forcing fallback to getSecret
    getItem: () => ({
      category: 'API_CREDENTIAL',
      fields: [
        { label: 'username', value: 'mock-value' },
        { label: 'notes', value: 'mock-value' },
      ],
    }),
    getSecret: (_name: string, _vault: string, field: string) => {
      usedField = field;
      return 'my-secret';
    },
  });

  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  // Explicitly specify --field token
  await getCommand('My API Key', { field: 'token' });

  assert.equal(usedField, 'token', 'Should use explicit field over smart detection');

  logMock.mock.restore();
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
    findSimilarItemsWithScore: () => [
      { title: 'GITHUB_TOKEN', score: 85 },
      { title: 'GITHUB_PAT', score: 72 },
    ],
    getItem: () => null,
    getDefaultFieldForCategory: (cat: string) => 'password',
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