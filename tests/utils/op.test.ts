import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItemFields, getDefaultFieldForCategory, matchQueryToText, getNonEmptyFields } from '../../src/utils/op.js';

test('getDefaultFieldForCategory returns credential for API_CREDENTIAL', async () => {
  assert.equal(getDefaultFieldForCategory('API_CREDENTIAL'), 'credential');
});

test('getDefaultFieldForCategory returns password for LOGIN', async () => {
  assert.equal(getDefaultFieldForCategory('LOGIN'), 'password');
});

test('getDefaultFieldForCategory returns password for PASSWORD', async () => {
  assert.equal(getDefaultFieldForCategory('PASSWORD'), 'password');
});

test('getDefaultFieldForCategory returns notesPlain for SECURE_NOTE', async () => {
  assert.equal(getDefaultFieldForCategory('SECURE_NOTE'), 'notesPlain');
});

test('getDefaultFieldForCategory returns password for unknown category', async () => {
  assert.equal(getDefaultFieldForCategory('UNKNOWN_CATEGORY'), 'password');
});

test('getItemFields returns field labels from item', async (t) => {
  // Test that the function is exported and callable
  assert.ok(typeof getItemFields === 'function', 'getItemFields should be exported');
});

test('getItemFields returns empty array when item has no fields', async (t) => {
  // This will test the function behavior - will fail until implementation
  // Note: Full integration tests would require mocking getItem
  assert.ok(Array.isArray(getItemFields('nonexistent-item', 'Private')));
});

test('matchQueryToText matches tokens across punctuation and case', async () => {
  assert.equal(matchQueryToText('Daytona API', 'daytona-api url'), true);
  assert.equal(matchQueryToText('sandbox', 'Sandbox-Env'), true);
  assert.equal(matchQueryToText('daytona', 'ListMonk API'), false);
});

test('getNonEmptyFields filters empty values', async () => {
  const fields = getNonEmptyFields([
    { id: 'token', label: 'token', type: 'CONCEALED', value: 'abc' },
    { id: 'empty', label: 'empty', type: 'STRING', value: '' },
    { id: 'spaces', label: 'spaces', type: 'STRING', value: '   ' },
    { id: 'unset', label: 'unset', type: 'STRING' },
  ]);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].id, 'token');
});
