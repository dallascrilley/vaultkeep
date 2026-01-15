import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareLinkResolver } from '../../src/utils/op.js';
import { OpError } from '../../src/utils/types.js';

test('falls back to user env when service account is restricted', () => {
  const calls: NodeJS.ProcessEnv[] = [];

  const resolver = createShareLinkResolver({
    getServiceAccountEnv: () => ({ OP_SERVICE_ACCOUNT_TOKEN: 'token' }),
    getUserEnv: () => ({}),
    execFileSync: (_cmd, _args, options) => {
      calls.push(options.env ?? {});
      if (options.env?.OP_SERVICE_ACCOUNT_TOKEN) {
        const error = new Error(
          'vault query must be provided when this command is called by a service account'
        ) as Error & { stderr?: string };
        error.stderr =
          'vault query must be provided when this command is called by a service account';
        throw error;
      }
      return JSON.stringify({
        id: 'item1',
        title: 'Sentry',
        vault: 'Private',
        category: 'password',
      });
    },
  });

  const item = resolver('https://share.1password.com/s#abc');

  assert.equal(item.title, 'Sentry');
  assert.equal(calls.length, 3);
  assert.ok(calls[0].OP_SERVICE_ACCOUNT_TOKEN);
  assert.ok(calls[1].OP_SERVICE_ACCOUNT_TOKEN);
  assert.ok(!calls[2].OP_SERVICE_ACCOUNT_TOKEN);
});

test('throws a friendly error when share links are unsupported', () => {
  const resolver = createShareLinkResolver({
    getServiceAccountEnv: () => ({}),
    getUserEnv: () => ({}),
    execFileSync: () => {
      const error = new Error('unknown flag: --share-link') as Error & {
        stderr?: string;
      };
      error.stderr = 'unknown flag: --share-link';
      throw error;
    },
  });

  assert.throws(
    () => resolver('https://share.1password.com/s#abc'),
    (error) =>
      error instanceof OpError &&
      error.message.includes('Share links are not supported')
  );
});
