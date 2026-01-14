import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRunCommand, ProcessLike } from '../../src/commands/run.js';
import type spawnType from 'cross-spawn';
import type { readFileSync as readFileSyncType } from 'node:fs';

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
    readFileSync: ((path: string, encoding: BufferEncoding) =>
      'API_KEY=MY_SECRET') as typeof readFileSyncType,
    existsSync: () => true,
    parseEnv: () => ({ API_KEY: 'MY_SECRET' }),
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
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
    readFileSync: ((path: string, encoding: BufferEncoding) => '') as typeof readFileSyncType,
    existsSync: () => false,
    parseEnv: () => ({}),
    spawn: ((cmd: string, args: string[], options: any) => {
      spawnCalls.push({ cmd, args, options });
      setImmediate(() => child.emit('exit', 0, null));
      return child as any;
    }) as unknown as typeof spawnType,
    process: processMock,
  });

  await runCommand(['printenv', 'API_KEY'], { env: ['API_KEY=OVERRIDE'] });

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].options.env.API_KEY, 'override-value');
});
