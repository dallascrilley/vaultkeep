import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createImportCommand } from '../../src/commands/import.js';
import type oraType from 'ora';
import type { readFileSync as readFileSyncType } from 'node:fs';
import type inquirer from 'inquirer';

function createSpinner() {
  type Spinner = ReturnType<typeof oraType>;
  const spinner = {
    text: '',
    succeedMessages: [] as string[],
    succeed: (message?: string) => {
      if (message) spinner.succeedMessages.push(message);
    },
  };
  return spinner as unknown as Spinner;
}

test('imports new secrets from env file', async () => {
  const created: Array<{ title: string; value: string; vault: string; field: string }> = [];
  const promptMock = (async () => ({ action: 'skip' })) as unknown as typeof inquirer.prompt;

  const importCommand = createImportCommand({
    checkOpCli: () => {},
    readFileSync: ((path: string, encoding: BufferEncoding) =>
      'API_KEY=one\nDB_PASS=two') as typeof readFileSyncType,
    parseEnv: () => ({ API_KEY: 'one', DB_PASS: 'two' }),
    getItem: () => null,
    createItem: (
      title: string,
      value: string,
      vault?: string,
      field?: string
    ) => {
      created.push({
        title,
        value,
        vault: vault ?? 'Private',
        field: field ?? 'password',
      });
    },
    updateItem: () => {},
    prompt: promptMock,
    isInteractive: () => true,
    createSpinner: () => createSpinner(),
  });

  await importCommand('.env', { vault: 'Work' });

  assert.equal(created.length, 2);
  assert.deepEqual(created[0], {
    title: 'API_KEY',
    value: 'one',
    vault: 'Work',
    field: 'password',
  });
});

test('skips existing secrets when user chooses skip', async () => {
  const created: Array<string> = [];
  const updated: Array<string> = [];
  const promptMock = (async () => ({ action: 'skip' })) as unknown as typeof inquirer.prompt;

  const importCommand = createImportCommand({
    checkOpCli: () => {},
    readFileSync: ((path: string, encoding: BufferEncoding) =>
      'API_KEY=one') as typeof readFileSyncType,
    parseEnv: () => ({ API_KEY: 'one' }),
    getItem: () => ({ id: '1', title: 'API_KEY', vault: 'Private', category: 'password' }),
    createItem: (title: string) => {
      created.push(title);
    },
    updateItem: (title: string) => {
      updated.push(title);
    },
    prompt: promptMock,
    isInteractive: () => true,
    createSpinner: () => createSpinner(),
  });

  await importCommand('.env', {});

  assert.equal(created.length, 0);
  assert.equal(updated.length, 0);
});

test('exits with OpError when env parsing fails', async () => {
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  const importCommand = createImportCommand({
    checkOpCli: () => {},
    readFileSync: ((path: string, encoding: BufferEncoding) =>
      'INVALID_LINE') as typeof readFileSyncType,
    parseEnv: () => {
      throw new Error('Parse failure');
    },
    getItem: () => null,
    createItem: () => {},
    updateItem: () => {},
    prompt: (async () => ({ action: 'skip' })) as unknown as typeof inquirer.prompt,
    isInteractive: () => true,
    createSpinner: () => createSpinner(),
  });

  await assert.rejects(() => importCommand('.env', {}), /process\.exit/);
  assert.equal(exitCalls[0], 2);

  exitMock.mock.restore();
  errorMock.mock.restore();
});
