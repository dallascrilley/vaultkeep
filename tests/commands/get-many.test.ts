/**
 * Tests for get-many command
 */
import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGetManyCommand, GetManyOptions } from '../../src/commands/get-many.js';

function createMockDeps(overrides: Record<string, unknown> = {}) {
  return {
    getSecret: mock.fn((name: string) => {
      const secrets: Record<string, string> = {
        API_KEY: 'secret-api-key',
        DB_PASSWORD: 'secret-db-password',
        JWT_SECRET: 'secret-jwt',
      };
      return secrets[name] ?? null;
    }),
    checkOpCli: mock.fn(() => {}),
    getItem: mock.fn((name: string) => ({
      id: `id-${name}`,
      title: name,
      category: 'LOGIN',
    })),
    getDefaultFieldForCategory: mock.fn(() => 'password'),
    applyColorConfig: mock.fn(() => {}),
    createSpinner: mock.fn(() => ({
      start: mock.fn(),
      succeed: mock.fn(),
      fail: mock.fn(),
      warn: mock.fn(),
    })),
    resolveBooleanOption: mock.fn(() => false),
    resolveField: mock.fn((f?: string) => f ?? 'password'),
    resolveVault: mock.fn((v?: string) => v ?? 'Private'),
    ...overrides,
  };
}

describe('get-many command', () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    logs = [];
    errors = [];
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    console.error = (...args: unknown[]) => errors.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test('retrieves multiple secrets successfully', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'DB_PASSWORD'], { quiet: true, plain: true });

    assert.equal(deps.getSecret.mock.calls.length, 2);
    assert.ok(logs.some((l) => l.includes('secret-api-key')));
    assert.ok(logs.some((l) => l.includes('secret-db-password')));
  });

  test('outputs JSON format correctly', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'DB_PASSWORD'], { json: true });

    const output = logs.join('\n');
    const parsed = JSON.parse(output);
    assert.equal(parsed.API_KEY, 'secret-api-key');
    assert.equal(parsed.DB_PASSWORD, 'secret-db-password');
  });

  test('outputs env format correctly', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'DB_PASSWORD'], { env: true, quiet: true });

    assert.ok(logs.some((l) => l.includes('API_KEY="secret-api-key"')));
    assert.ok(logs.some((l) => l.includes('DB_PASSWORD="secret-db-password"')));
  });

  test('outputs plain format correctly', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'DB_PASSWORD'], { plain: true, quiet: true });

    assert.equal(logs[0], 'secret-api-key');
    assert.equal(logs[1], 'secret-db-password');
  });

  test('handles missing secrets with error by default', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as typeof process.exit;

    try {
      await getMany(['API_KEY', 'MISSING_SECRET'], { quiet: true });
      assert.fail('Should have thrown');
    } catch (error) {
      assert.ok((error as Error).message.includes('process.exit'));
      assert.equal(exitCode, 1);
    } finally {
      process.exit = originalExit;
    }
  });

  test('continues on error with --continue-on-error flag', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'MISSING_SECRET'], {
      continueOnError: true,
      json: true,
    });

    const output = logs.join('\n');
    const parsed = JSON.parse(output);
    assert.equal(parsed.API_KEY, 'secret-api-key');
    assert.equal(parsed.MISSING_SECRET, null);
  });

  test('escapes special characters in env format', async () => {
    const deps = createMockDeps({
      getSecret: mock.fn((name: string) => {
        if (name === 'SPECIAL') return 'value with $var and "quotes"';
        return null;
      }),
    });
    const getMany = createGetManyCommand(deps);

    await getMany(['SPECIAL'], { env: true, continueOnError: true, quiet: true });

    const output = logs.find((l) => l.includes('SPECIAL='));
    assert.ok(output);
    assert.ok(output.includes('\\$var'));
    assert.ok(output.includes('\\"quotes\\"'));
  });

  test('validates at least one name is required', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as typeof process.exit;

    try {
      await getMany([], {});
      assert.fail('Should have thrown');
    } catch (error) {
      assert.ok((error as Error).message.includes('process.exit'));
      assert.equal(exitCode, 2);
    } finally {
      process.exit = originalExit;
    }
  });

  test('rejects multiple output format options', async () => {
    const deps = createMockDeps();
    const getMany = createGetManyCommand(deps);

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as typeof process.exit;

    try {
      await getMany(['API_KEY'], { json: true, env: true });
      assert.fail('Should have thrown');
    } catch (error) {
      assert.ok((error as Error).message.includes('process.exit'));
      assert.equal(exitCode, 2);
    } finally {
      process.exit = originalExit;
    }
  });

  test('uses smart field detection per item', async () => {
    const deps = createMockDeps({
      getItem: mock.fn((name: string) => ({
        id: `id-${name}`,
        title: name,
        category: name === 'API_KEY' ? 'API_CREDENTIAL' : 'LOGIN',
      })),
      getDefaultFieldForCategory: mock.fn((cat: string) =>
        cat === 'API_CREDENTIAL' ? 'credential' : 'password'
      ),
    });
    const getMany = createGetManyCommand(deps);

    await getMany(['API_KEY', 'DB_PASSWORD'], { plain: true, quiet: true });

    // Check that getDefaultFieldForCategory was called with correct categories
    const calls = deps.getDefaultFieldForCategory.mock.calls;
    assert.ok(calls.some((c) => c.arguments[0] === 'API_CREDENTIAL'));
    assert.ok(calls.some((c) => c.arguments[0] === 'LOGIN'));
  });

  test('processes all secrets with parallel option', async () => {
    let callCount = 0;
    const callOrder: string[] = [];

    const deps = createMockDeps({
      getSecret: mock.fn((name: string) => {
        callCount++;
        callOrder.push(name);
        return `secret-${name}`;
      }),
    });
    const getMany = createGetManyCommand(deps);

    await getMany(['A', 'B', 'C', 'D', 'E', 'F'], {
      parallel: 2,
      plain: true,
      quiet: true,
    });

    // All 6 secrets should be fetched
    assert.equal(callCount, 6);
    assert.equal(callOrder.length, 6);
    // All names should be present
    assert.ok(callOrder.includes('A'));
    assert.ok(callOrder.includes('F'));
  });
});
