import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTemplateApplyCommand,
  createTemplateCreateCommand,
  parseTemplateFields,
  type SecretTemplate,
} from '../../src/commands/template.js';
import { OpError } from '../../src/utils/types.js';

const postgresTemplate: SecretTemplate = {
  name: 'postgres',
  description: 'Postgres connection fields',
  fields: ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  source: 'builtin',
};

test('parseTemplateFields splits and dedupes fields', () => {
  const fields = parseTemplateFields('API_KEY, API_SECRET  WEBHOOK_URL,API_KEY');
  assert.deepEqual(fields, ['API_KEY', 'API_SECRET', 'WEBHOOK_URL']);
});

test('create template stores custom template', async () => {
  let saved: Record<string, SecretTemplate> = {};

  const createTemplate = createTemplateCreateCommand({
    checkOpCli: () => {},
    loadCustomTemplates: () => ({}),
    saveCustomTemplates: (templates) => {
      saved = templates;
    },
    parseTemplateFields: () => ['API_KEY', 'API_SECRET'],
    applyColorConfig: () => {},
    resolveBooleanOption: () => false,
    isBuiltinTemplate: () => false,
  });

  await createTemplate('my-service', { fields: 'API_KEY,API_SECRET' });

  assert.ok(saved['my-service']);
  assert.deepEqual(saved['my-service'].fields, ['API_KEY', 'API_SECRET']);
});

test('apply template prompts for missing values and sets secrets', async () => {
  const setCalls: Array<{ name: string; value: string; vault: string; field: string }> = [];
  let promptCalls = 0;

  const applyTemplate = createTemplateApplyCommand({
    checkOpCli: () => {},
    getTemplateByName: () => postgresTemplate,
    prompt: async () => {
      promptCalls += 1;
      return { value: 'prompted' };
    },
    isInteractiveInput: () => true,
    setSecret: (name, value, vault, field) => {
      setCalls.push({ name, value, vault, field });
    },
    resolveVault: () => 'Work',
    resolveField: () => 'password',
    resolveBooleanOption: () => false,
    applyColorConfig: () => {},
  });

  await applyTemplate('postgres', { values: ['DB_HOST=localhost'] });

  assert.equal(promptCalls, postgresTemplate.fields.length - 1);
  assert.equal(setCalls.length, postgresTemplate.fields.length);
  assert.equal(setCalls[0].vault, 'Work');
  assert.equal(setCalls[0].field, 'password');
});

test('apply template fails when no input allowed and values missing', async () => {
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  const applyTemplate = createTemplateApplyCommand({
    checkOpCli: () => {},
    getTemplateByName: () => postgresTemplate,
    prompt: async () => ({ value: 'prompted' }),
    isInteractiveInput: () => false,
    setSecret: () => {},
    resolveVault: () => 'Work',
    resolveField: () => 'password',
    resolveBooleanOption: () => false,
    applyColorConfig: () => {},
  });

  await assert.rejects(
    () => applyTemplate('postgres', { values: [], input: false }),
    /process\.exit/
  );

  assert.equal(exitCalls[0], 2);

  exitMock.mock.restore();
  errorMock.mock.restore();
});
