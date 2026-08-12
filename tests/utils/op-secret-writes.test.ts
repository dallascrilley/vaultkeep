import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSecretWriter,
  describeOpCommand,
  redactSecretValues,
  type OpItemDocument,
} from '../../src/utils/op.js';
import { OpError } from '../../src/utils/types.js';

const SENTINEL = 'sentinel-secret-value-do-not-leak-9f3a';

interface Spawn {
  file: string;
  args: string[];
  input: string;
}

function recordingExec(
  spawns: Spawn[],
  onCall?: (call: Spawn) => void
): any {
  return (file: string, args: readonly string[], options: any) => {
    const call: Spawn = {
      file,
      args: [...args],
      input: typeof options?.input === 'string' ? options.input : '',
    };
    spawns.push(call);
    onCall?.(call);
    return Buffer.from('');
  };
}

function writerWith(
  spawns: Spawn[],
  document: OpItemDocument | null,
  onCall?: (call: Spawn) => void
) {
  return createSecretWriter({
    execFileSync: recordingExec(spawns, onCall),
    getEnv: () => ({}),
    getItemDocument: () => (document ? structuredClone(document) : null),
  });
}

const existingDocument: OpItemDocument = {
  id: 'abc123',
  title: 'MY_SECRET',
  vault: { id: 'v1', name: 'Private' },
  category: 'PASSWORD',
  fields: [
    { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' },
    { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: '' },
  ],
};

function assertNoSecretInArgv(spawns: Spawn[]) {
  assert.ok(spawns.length > 0, 'expected op to be spawned');
  for (const spawn of spawns) {
    for (const arg of spawn.args) {
      assert.ok(
        !arg.includes(SENTINEL),
        `secret value leaked into argv entry: ${arg}`
      );
    }
    assert.ok(
      !spawn.args.some((arg) => /^[^-].*=/.test(arg)),
      `write used an assignment statement, which puts values in argv: ${spawn.args.join(' ')}`
    );
  }
}

test('setSecret create path keeps the value out of argv and sends it on stdin', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, null).setSecret('NEW_SECRET', SENTINEL, 'Private', 'password');

  assertNoSecretInArgv(spawns);
  assert.deepEqual(spawns[0].args, ['item', 'create', '-', '--vault', 'Private']);

  const template = JSON.parse(spawns[0].input);
  assert.equal(template.title, 'NEW_SECRET');
  assert.equal(template.category, 'PASSWORD');
  assert.equal(template.fields[0].value, SENTINEL, 'value must travel via stdin');
});

test('setSecret update path keeps the value out of argv and preserves other fields', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, existingDocument).setSecret('MY_SECRET', SENTINEL, 'Private', 'password');

  assertNoSecretInArgv(spawns);
  assert.deepEqual(spawns[0].args, ['item', 'edit', 'abc123', '--vault', 'Private']);

  const document = JSON.parse(spawns[0].input);
  const password = document.fields.find((f: any) => f.id === 'password');
  assert.equal(password.value, SENTINEL);
  assert.ok(
    document.fields.some((f: any) => f.id === 'notesPlain'),
    'round-trip must preserve untouched fields'
  );
});

test('createItem keeps the value out of argv', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, null).createItem('IMPORTED', SENTINEL, 'Work', 'password');

  assertNoSecretInArgv(spawns);
  assert.equal(JSON.parse(spawns[0].input).fields[0].value, SENTINEL);
});

test('updateItem keeps the value out of argv', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, existingDocument).updateItem('MY_SECRET', SENTINEL, 'Private', 'password');

  assertNoSecretInArgv(spawns);
  assert.equal(
    JSON.parse(spawns[0].input).fields.find((f: any) => f.id === 'password').value,
    SENTINEL
  );
});

test('a custom field name creates a readable item without an assignment statement', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, null).setSecret('API_ITEM', SENTINEL, 'Private', 'api_key');

  assertNoSecretInArgv(spawns);
  const template = JSON.parse(spawns[0].input);
  assert.equal(template.category, 'API_CREDENTIAL');
  assert.deepEqual(template.fields, [
    { label: 'api_key', type: 'CONCEALED', value: SENTINEL },
  ]);
});

test('updating an absent field appends it rather than replacing the item', async () => {
  const spawns: Spawn[] = [];
  writerWith(spawns, existingDocument).setSecret('MY_SECRET', SENTINEL, 'Private', 'api_key');

  const document = JSON.parse(spawns[0].input);
  assert.equal(document.fields.length, 3);
  assert.deepEqual(document.fields[2], {
    label: 'api_key',
    type: 'CONCEALED',
    value: SENTINEL,
  });
});

test('a failed write never reports the secret value', async () => {
  for (const [name, run] of [
    ['setSecret create', (w: any) => w.setSecret('NEW', SENTINEL, 'Nope', 'password')],
    ['createItem', (w: any) => w.createItem('NEW', SENTINEL, 'Nope', 'password')],
  ] as const) {
    const spawns: Spawn[] = [];
    const writer = writerWith(spawns, null, () => {
      // Mirror what Node's execFileSync actually throws: the full argv is
      // embedded in error.message, and op writes to stderr.
      const error: any = new Error(
        `Command failed: op item create - --vault Nope password=${SENTINEL}`
      );
      error.status = 1;
      error.stderr = Buffer.from(
        `[ERROR] no vault matched "Nope"\ncontext: ${SENTINEL}`
      );
      throw error;
    });

    assert.throws(
      () => run(writer),
      (error: unknown) => {
        assert.ok(error instanceof OpError, `${name} should throw OpError`);
        assert.ok(
          !error.message.includes(SENTINEL),
          `${name} leaked the secret into the error message: ${error.message}`
        );
        assert.ok(
          error.message.includes('op item create'),
          `${name} should name the failing command`
        );
        assert.ok(
          error.message.includes('--vault'),
          `${name} should keep flags in the message`
        );
        assert.ok(
          error.message.includes('no vault matched'),
          `${name} should keep the actionable stderr detail`
        );
        return true;
      }
    );
  }
});

test('a failed update never reports the secret value', async () => {
  const spawns: Spawn[] = [];
  const writer = writerWith(spawns, existingDocument, () => {
    const error: any = new Error(
      `Command failed: op item edit abc123 --vault Private password=${SENTINEL}`
    );
    error.status = 1;
    error.stderr = Buffer.from('[ERROR] session expired');
    throw error;
  });

  assert.throws(
    () => writer.updateItem('MY_SECRET', SENTINEL, 'Private', 'password'),
    (error: unknown) => {
      assert.ok(error instanceof OpError);
      assert.ok(!error.message.includes(SENTINEL), error.message);
      assert.ok(error.message.includes('op item edit'));
      assert.ok(error.message.includes('session expired'));
      return true;
    }
  );
});

test('updateItem fails clearly when the item does not exist', async () => {
  const spawns: Spawn[] = [];
  assert.throws(
    () => writerWith(spawns, null).updateItem('GONE', SENTINEL, 'Private', 'password'),
    (error: unknown) => {
      assert.ok(error instanceof OpError);
      assert.ok(!error.message.includes(SENTINEL));
      assert.match(error.message, /not found/);
      return true;
    }
  );
  assert.equal(spawns.length, 0, 'no write should be attempted');
});

test('updates refuse items whose attachments a JSON template would destroy', async () => {
  const spawns: Spawn[] = [];
  const withFile: OpItemDocument = {
    ...existingDocument,
    category: 'DOCUMENT',
    files: [{ id: 'f1', name: 'key.pem' }],
  };

  assert.throws(
    () => writerWith(spawns, withFile).setSecret('DOC', SENTINEL, 'Private', 'password'),
    (error: unknown) => {
      assert.ok(error instanceof OpError);
      assert.ok(!error.message.includes(SENTINEL));
      assert.match(error.message, /file attachments/);
      return true;
    }
  );
  assert.equal(spawns.length, 0, 'no write should be attempted');
});

test('updates refuse a document whose values came back masked', async () => {
  const spawns: Spawn[] = [];
  const masked: OpItemDocument = {
    ...existingDocument,
    fields: [
      { id: 'password', type: 'CONCEALED', label: 'password', value: '••••••••' },
    ],
  };

  assert.throws(
    () => writerWith(spawns, masked).setSecret('MY_SECRET', SENTINEL, 'Private', 'password'),
    (error: unknown) => {
      assert.ok(error instanceof OpError);
      assert.ok(!error.message.includes(SENTINEL));
      assert.match(error.message, /masked field values/);
      return true;
    }
  );
  assert.equal(spawns.length, 0, 'no write should be attempted');
});

test('describeOpCommand redacts assignment values but keeps flags', async () => {
  const rendered = describeOpCommand([
    'item',
    'create',
    '--category=password',
    '--vault',
    'Private',
    `password=${SENTINEL}`,
  ]);

  assert.ok(!rendered.includes(SENTINEL), rendered);
  assert.ok(rendered.includes('password=[redacted]'));
  assert.ok(rendered.includes('--category=password'));
  assert.ok(rendered.startsWith('op item create'));
});

test('redactSecretValues removes every occurrence and ignores empty secrets', async () => {
  const text = `a ${SENTINEL} b ${SENTINEL}`;
  const redacted = redactSecretValues(text, [SENTINEL, '']);

  assert.ok(!redacted.includes(SENTINEL));
  assert.equal(redacted, 'a [redacted] b [redacted]');
});
