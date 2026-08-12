import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExportCommand, EXPORT_FILE_MODE } from '../../src/commands/export.js';
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
    chmodSync: () => {},
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
    chmodSync: () => {},
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
    chmodSync: () => {},
    createSpinner: () => createSpinner(),
  });

  await exportCommand({ output: '/existing/dir/secrets.env', quiet: true });

  assert.equal(written.length, 1);
  assert.equal(written[0].path, '/existing/dir/secrets.env');
  assert.ok(written[0].content.includes('API_KEY="my-secret"'));

  logMock.mock.restore();
});

test('export requests mode 0600 for the plaintext secrets file', async () => {
  const writeCalls: Array<{ path: string; options?: { mode?: number } }> = [];
  const chmodCalls: Array<{ path: string; mode: number }> = [];
  const logMock = mock.method(console, 'log', () => {});

  const exportCommand = createExportCommand({
    checkOpCli: () => {},
    listItems: () => [{ id: '1', title: 'API_KEY', vault: 'Private', category: 'password' }],
    getItem: () => ({
      id: '1',
      title: 'API_KEY',
      vault: 'Private',
      category: 'password',
      fields: [{ id: 'password', type: 'CONCEALED', label: 'password', value: 'my-secret' }],
    }),
    existsSync: () => true,
    dirname: () => '/existing/dir',
    writeFileSync: (path: string, _content: string, options?: { mode?: number }) => {
      writeCalls.push({ path, options });
    },
    chmodSync: (path: string, mode: number) => {
      chmodCalls.push({ path, mode });
    },
    createSpinner: () => createSpinner(),
  });

  await exportCommand({ output: '/existing/dir/secrets.env', quiet: true });

  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].options?.mode, EXPORT_FILE_MODE);
  assert.equal(EXPORT_FILE_MODE, 0o600);

  if (process.platform === 'win32') {
    assert.equal(chmodCalls.length, 0, 'chmod is skipped on Windows');
  } else {
    assert.deepEqual(chmodCalls, [{ path: '/existing/dir/secrets.env', mode: 0o600 }]);
  }

  logMock.mock.restore();
});

test('export writes a real file with owner-only permissions', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX file modes are not meaningful on Windows');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'ops-export-mode-'));
  const target = join(dir, 'secrets.env');
  // Pre-create the file world-readable: the export must narrow it, not inherit it.
  writeFileSync(target, 'stale', { mode: 0o644 });
  const logMock = mock.method(console, 'log', () => {});

  const exportCommand = createExportCommand({
    checkOpCli: () => {},
    listItems: () => [{ id: '1', title: 'API_KEY', vault: 'Private', category: 'password' }],
    getItem: () => ({
      id: '1',
      title: 'API_KEY',
      vault: 'Private',
      category: 'password',
      fields: [{ id: 'password', type: 'CONCEALED', label: 'password', value: 'my-secret' }],
    }),
    existsSync,
    dirname,
    writeFileSync,
    chmodSync,
    createSpinner: () => createSpinner(),
  });

  try {
    await exportCommand({ output: target, quiet: true });
    assert.equal(statSync(target).mode & 0o777, 0o600);
    assert.ok(readFileSync(target, 'utf8').includes('API_KEY="my-secret"'));
  } finally {
    logMock.mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});
