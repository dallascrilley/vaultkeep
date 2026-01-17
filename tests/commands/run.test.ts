import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRunCommand, ProcessLike } from '../../src/commands/run.js';
import type spawnType from 'cross-spawn';
import { OpError } from '../../src/utils/types.js';

class FakeChildProcess extends EventEmitter {
  pid = 123;
  killedSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals) {
    this.killedSignals.push(signal);
    return true;
  }
}

function createProcessMock(env: NodeJS.ProcessEnv): ProcessLike {
  const processMock = new EventEmitter() as unknown as ProcessLike;
  processMock.env = env;
  processMock.on = processMock.on.bind(processMock);
  processMock.off = processMock.off.bind(processMock);
  return processMock;
}

test('loads secrets from env file and injects into command env', async () => {
  const child = new FakeChildProcess();
  const spawnCalls: Array<{ cmd: string; args: string[]; options: any }> = [];
  const processMock = createProcessMock({ PATH: '/bin' });

  const runCommand = createRunCommand({
    checkOpCli: () => {},
    getSecret: (reference: string) =>
      reference === 'MY_SECRET' ? 'secret-value' : null,
    getSecretAsync: async (reference: string) =>
      reference === 'MY_SECRET' ? 'secret-value' : null,
    loadEnvMappingFile: () => ({ API_KEY: 'MY_SECRET' }),
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
    loadConfig: () => ({}),
  });

  await runCommand(['node', 'app.js'], {});

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].cmd, 'node');
  assert.deepEqual(spawnCalls[0].args, ['app.js']);
  assert.equal(spawnCalls[0].options.env.API_KEY, 'secret-value');
  assert.equal(spawnCalls[0].options.env.PATH, '/bin');
});

test('uses --env overrides when provided', async () => {
  const child = new FakeChildProcess();
  const spawnCalls: Array<{ cmd: string; args: string[]; options: any }> = [];
  const processMock = createProcessMock({});

  const runCommand = createRunCommand({
    checkOpCli: () => {},
    getSecret: (reference: string) =>
      reference === 'OVERRIDE' ? 'override-value' : null,
    getSecretAsync: async (reference: string) =>
      reference === 'OVERRIDE' ? 'override-value' : null,
    loadEnvMappingFile: () => ({}),
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
    loadConfig: () => ({}),
  });

  await runCommand(['printenv', 'API_KEY'], { env: ['API_KEY=OVERRIDE'] });

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].options.env.API_KEY, 'override-value');
});

test('exits with OpError when env file parsing fails', async () => {
  const processMock = createProcessMock({});
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  const runCommand = createRunCommand({
    checkOpCli: () => {},
    getSecret: () => 'value',
    getSecretAsync: async () => 'value',
    loadEnvMappingFile: () => {
      throw new OpError('Failed to parse \"custom.env.ops\": Parse failure', 2);
    },
    spawn: (() => {
      throw new Error('spawn should not be called');
    }) as unknown as typeof spawnType,
    process: processMock,
    loadConfig: () => ({ envFile: 'custom.env.ops' }),
  });

  await assert.rejects(() => runCommand(['echo', 'ok'], {}), /process\.exit/);
  assert.equal(exitCalls[0], 2);

  exitMock.mock.restore();
  errorMock.mock.restore();
});

test('--verbose flag logs injected variable names without exposing values', async () => {
  const child = new FakeChildProcess();
  const spawnCalls: Array<{ cmd: string; args: string[]; options: any }> = [];
  const processMock = createProcessMock({ PATH: '/bin' });
  const logOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    logOutput.push(msg);
  });

  const runCommand = createRunCommand({
    checkOpCli: () => {},
    getSecret: (reference: string) => {
      if (reference === 'SECRET_A') return 'actual-secret-value-a';
      if (reference === 'SECRET_B') return 'actual-secret-value-b';
      return null;
    },
    getSecretAsync: async (reference: string) => {
      if (reference === 'SECRET_A') return 'actual-secret-value-a';
      if (reference === 'SECRET_B') return 'actual-secret-value-b';
      return null;
    },
    loadEnvMappingFile: () => ({ API_KEY: 'SECRET_A', DB_PASS: 'SECRET_B' }),
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
    loadConfig: () => ({}),
  });

  await runCommand(['node', 'app.js'], { verbose: true });

  logMock.mock.restore();

  // Verify verbose output shows variable names
  const combinedLog = logOutput.join('\n');
  assert.ok(combinedLog.includes('API_KEY'), 'Should log API_KEY variable name');
  assert.ok(combinedLog.includes('DB_PASS'), 'Should log DB_PASS variable name');
  assert.ok(combinedLog.includes('node app.js'), 'Should log the command being run');

  // Verify secret values are NOT exposed in verbose output
  assert.ok(!combinedLog.includes('actual-secret-value-a'), 'Should NOT expose secret value a');
  assert.ok(!combinedLog.includes('actual-secret-value-b'), 'Should NOT expose secret value b');

  // Verify command still executed correctly
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].options.env.API_KEY, 'actual-secret-value-a');
  assert.equal(spawnCalls[0].options.env.DB_PASS, 'actual-secret-value-b');
});

test('uses config envFile when --env-file is not provided', async () => {
  const child = new FakeChildProcess();
  const spawnCalls: Array<{ cmd: string; args: string[]; options: any }> = [];
  const processMock = createProcessMock({ PATH: '/bin' });

  const runCommand = createRunCommand({
    checkOpCli: () => {},
    getSecret: (reference: string) =>
      reference === 'CONFIG_SECRET' ? 'config-value' : null,
    getSecretAsync: async (reference: string) =>
      reference === 'CONFIG_SECRET' ? 'config-value' : null,
    loadEnvMappingFile: (path: string) => {
      assert.equal(path, 'custom.env.ops');
      return { API_KEY: 'CONFIG_SECRET' };
    },
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
    loadConfig: () => ({ envFile: 'custom.env.ops' }),
  });

  await runCommand(['node', 'app.js'], {});

  assert.equal(spawnCalls[0].options.env.API_KEY, 'config-value');
});
