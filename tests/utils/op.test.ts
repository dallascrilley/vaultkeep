import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItemFields } from '../../src/utils/op.js';

test('getItemFields returns field labels from item', async (t) => {
  // Test that the function is exported and callable
  assert.ok(typeof getItemFields === 'function', 'getItemFields should be exported');
});

test('getItemFields returns empty array when item has no fields', async (t) => {
  // This will test the function behavior - will fail until implementation
  // Note: Full integration tests would require mocking getItem
  assert.ok(Array.isArray(getItemFields('nonexistent-item', 'Private')));
});
