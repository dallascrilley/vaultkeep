import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createExportCommand } from '../../src/commands/export.js';
import type oraType from 'ora';

function createSpinner() {
  type Spinner = ReturnType<typeof oraType>;
  const spinner = {
    text: '',
    succeedMessages: [] as string[],
    warnMessages: [] as string[],
    succeed: (message?: string) => {
      if (message) spinner.succeedMessages.push(message);
    },
    warn: (message?: string) => {
      if (message) spinner.warnMessages.push(message);
    },
    stop: () => {},
  };
  return spinner as unknown as Spinner;
}

test('export fails early if output directory does not exist', async () => {
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  const listItemsCalled: boolean[] = [];

  const exportCommand = createExportCommand({
    checkOpCli: () => {},
    listItems: () => {
      listItemsCalled.push(true);
      return [];
    },
    getItem: () => null,
    existsSync: () => false, // Directory does not exist
    dirname: (p: string) => '/nonexistent/dir',
    writeFileSync: () => {},
    createSpinner: () => createSpinner(),
  });

  await assert.rejects(
    () => exportCommand({ output: '/nonexistent/dir/secrets.env' }),
    /process\.exit/
  );

  assert.equal(exitCalls[0], 2); // Exit code 2 for validation error
  assert.equal(listItemsCalled.length, 0, 'Should not call listItems before validation');

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('export skips path validation for stdout output', async () => {
  const listItemsCalled: boolean[] = [];
  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  const exportCommand = createExportCommand({
    checkOpCli: () => {},
    listItems: () => {
      listItemsCalled.push(true);
      return [{ id: '1', title: 'TEST', vault: 'Private', category: 'password' }];
    },
    getItem: () => ({
      id: '1',
      title: 'TEST',
      vault: 'Private',
      category: 'password',
      fields: [{ id: 'password', type: 'CONCEALED', label: 'password', value: 'secret' }],
    }),
    existsSync: () => false, // Would fail if checked, but should be skipped for stdout
    dirname: (p: string) => '/nonexistent',
    writeFileSync: () => {},
    createSpinner: () => createSpinner(),
  });

  // '-' means stdout, should skip path validation
  await exportCommand({ output: '-', quiet: true });

  assert.equal(listItemsCalled.length, 1, 'Should call listItems for stdout output');

  logMock.mock.restore();
});

test('export writes secrets to file when directory exists', async () => {
  const written: Array<{ path: string; content: string }> = [];
  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  const exportCommand = createExportCommand({
    checkOpCli: () => {},
    listItems: () => [
      { id: '1', title: 'API_KEY', vault: 'Private', category: 'password' },
    ],
    getItem: () => ({
      id: '1',
      title: 'API_KEY',
      vault: 'Private',
      category: 'password',
      fields: [{ id: 'password', type: 'CONCEALED', label: 'password', value: 'my-secret' }],
    }),
    existsSync: () => true, // Directory exists
    dirname: (p: string) => '/existing/dir',
    writeFileSync: (path: string, content: string) => {
      written.push({ path, content });
    },
    createSpinner: () => createSpinner(),
  });

  await exportCommand({ output: '/existing/dir/secrets.env', quiet: true });

  assert.equal(written.length, 1);
  assert.equal(written[0].path, '/existing/dir/secrets.env');
  assert.ok(written[0].content.includes('API_KEY="my-secret"'));

  logMock.mock.restore();
});
