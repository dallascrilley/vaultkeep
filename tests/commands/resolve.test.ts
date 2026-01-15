import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResolveCommand } from '../../src/commands/resolve.js';
import type oraType from 'ora';

function createSpinner() {
  type Spinner = ReturnType<typeof oraType>;
  const spinner = {
    text: '',
    succeed: () => {},
    fail: () => {},
    stop: () => {},
  };
  return spinner as unknown as Spinner;
}

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test('prints op reference and ops get command for share link', async () => {
  const { logs, restore } = captureConsole();

  const resolveCommand = createResolveCommand({
    checkOpCli: () => {},
    resolveShareLink: () => ({
      id: 'item1',
      title: 'Sentry',
      vault: 'Private',
      category: 'password',
      fields: [
        { id: 'auth-token', label: 'auth-token', type: 'CONCEALED' },
        { id: 'username', label: 'username', type: 'STRING' },
      ],
    }),
    createSpinner: () => createSpinner(),
  });

  await resolveCommand('https://share.1password.com/s#abc', {});
  restore();

  assert.ok(logs.some((line) => line.includes('op://Private/Sentry/auth-token')));
  assert.ok(
    logs.some((line) =>
      line.includes('ops get "Sentry" --vault "Private" --field "auth-token"')
    )
  );
  assert.ok(logs.some((line) => line.includes('Fields:')));
  assert.ok(logs.some((line) => line.includes('auth-token')));
  assert.ok(logs.some((line) => line.includes('username')));
});

test('emits json output when requested', async () => {
  const { logs, restore } = captureConsole();

  const resolveCommand = createResolveCommand({
    checkOpCli: () => {},
    resolveShareLink: () => ({
      id: 'item1',
      title: 'Sentry',
      vault: { id: 'vault1', name: 'Private' },
      category: 'password',
      fields: [
        { id: 'password', label: 'password', type: 'CONCEALED' },
        { id: 'username', label: 'username', type: 'STRING' },
      ],
    }),
    createSpinner: () => createSpinner(),
  });

  await resolveCommand('https://share.1password.com/s#abc', { json: true });
  restore();

  const payload = JSON.parse(logs.join('\n')) as {
    opReference: string;
    opsGet: string;
    fields: Array<{ id: string; label: string | null; type: string }>;
  };

  assert.equal(payload.opReference, 'op://Private/Sentry/password');
  assert.equal(
    payload.opsGet,
    'ops get "Sentry" --vault "Private" --field "password"'
  );
  assert.deepEqual(payload.fields, [
    { id: 'password', label: 'password', type: 'CONCEALED' },
    { id: 'username', label: 'username', type: 'STRING' },
  ]);
});
