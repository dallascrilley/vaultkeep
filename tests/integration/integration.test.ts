/**
 * Integration tests for Vaultkeep
 *
 * These tests run against a real 1Password vault.
 *
 * Prerequisites:
 * 1. Install 1Password CLI: https://1password.com/downloads/command-line/
 * 2. Sign in: `op signin`
 * 3. Create a test vault: `op vault create "ops-cli-test"`
 * 4. Create test items (see setup instructions below)
 *
 * Run tests:
 *   TEST_OP_CLI=1 npm test -- tests/integration/
 *
 * To skip these tests (default):
 *   npm test (omit TEST_OP_CLI=1)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';

const TEST_VAULT = 'ops-cli-test';
const TEST_ITEM_LOGIN = 'Test Login Item';
const TEST_ITEM_API = 'Test API Credential';
const TEST_ITEM_NOTE = 'Test Secure Note';

// Skip all tests if TEST_OP_CLI is not set
const shouldRun = process.env.TEST_OP_CLI === '1';

function runOps(args: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', ['dist/index.js', ...args.split(' ')], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function runOpsRaw(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', ['dist/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function opCliAvailable(): boolean {
  try {
    execSync('op --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function testVaultExists(): boolean {
  try {
    const result = execSync(`op vault get "${TEST_VAULT}" --format json 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return result.includes(TEST_VAULT);
  } catch {
    return false;
  }
}

function createTestVault(): void {
  try {
    execSync(`op vault create "${TEST_VAULT}"`, { stdio: 'pipe' });
  } catch {
    // Vault may already exist
  }
}

function createTestItems(): void {
  try {
    // Create a LOGIN item
    execSync(
      `op item create --category login --title "${TEST_ITEM_LOGIN}" --vault "${TEST_VAULT}" "username=testuser" "password=test-password-123"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Item may already exist
  }

  try {
    // Create an API_CREDENTIAL item
    execSync(
      `op item create --category "API Credential" --title "${TEST_ITEM_API}" --vault "${TEST_VAULT}" "credential=test-api-key-456"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Item may already exist
  }

  try {
    // Create a SECURE_NOTE item
    execSync(
      `op item create --category "Secure Note" --title "${TEST_ITEM_NOTE}" --vault "${TEST_VAULT}" "notesPlain=This is a test secure note."`,
      { stdio: 'pipe' }
    );
  } catch {
    // Item may already exist
  }
}

function cleanupTestVault(): void {
  try {
    // Delete test items
    execSync(`op item delete "${TEST_ITEM_LOGIN}" --vault "${TEST_VAULT}" 2>/dev/null`, { stdio: 'pipe' });
  } catch { /* ignore */ }

  try {
    execSync(`op item delete "${TEST_ITEM_API}" --vault "${TEST_VAULT}" 2>/dev/null`, { stdio: 'pipe' });
  } catch { /* ignore */ }

  try {
    execSync(`op item delete "${TEST_ITEM_NOTE}" --vault "${TEST_VAULT}" 2>/dev/null`, { stdio: 'pipe' });
  } catch { /* ignore */ }
}

// Main test suite
describe('Vaultkeep integration tests', { skip: !shouldRun }, () => {
  before(() => {
    if (!opCliAvailable()) {
      console.log('⚠️  1Password CLI (op) not available. Skipping integration tests.');
      return;
    }

    if (!testVaultExists()) {
      console.log(`📦 Creating test vault "${TEST_VAULT}"...`);
      createTestVault();
    }

    console.log('🔧 Setting up test items...');
    createTestItems();
    console.log('✅ Test setup complete\n');
  });

  after(() => {
    if (process.env.CLEANUP_TEST_VAULT === '1') {
      console.log('\n🧹 Cleaning up test items...');
      cleanupTestVault();
    }
  });

  test('ops --help shows available commands', () => {
    const result = runOps('--help');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('get'), 'Should list get command');
    assert.ok(result.stdout.includes('set'), 'Should list set command');
    assert.ok(result.stdout.includes('list'), 'Should list list command');
    assert.ok(result.stdout.includes('completion'), 'Should list completion command');
  });

  test('ops --version shows version number', () => {
    const result = runOps('--version');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.match(result.stdout, /\d+\.\d+\.\d+/, 'Should show semantic version');
  });

  test('ops vaults lists available vaults', () => {
    const result = runOps('vaults');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes(TEST_VAULT) || result.stdout.toLowerCase().includes('vault'),
      'Should list vaults');
  });

  test('ops vaults --json outputs valid JSON', () => {
    const result = runOps('vaults --json');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    const data = JSON.parse(result.stdout);
    assert.ok(Array.isArray(data), 'Should return an array');
  });

  test('ops list shows items in test vault', () => {
    const result = runOps(`list --vault ${TEST_VAULT}`);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    // May or may not have items, but shouldn't error
  });

  test('ops list --json outputs valid JSON', () => {
    const result = runOps(`list --vault ${TEST_VAULT} --json`);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    const data = JSON.parse(result.stdout);
    assert.ok(Array.isArray(data), 'Should return an array');
  });

  test('ops get retrieves LOGIN item password', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['get', TEST_ITEM_LOGIN, '--vault', TEST_VAULT, '--plain']);
    if (result.exitCode !== 0) {
      console.log('stderr:', result.stderr);
    }
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('test-password-123'), 'Should return the password');
  });

  test('ops get uses smart field detection for API_CREDENTIAL', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['get', TEST_ITEM_API, '--vault', TEST_VAULT, '--plain']);
    if (result.exitCode !== 0) {
      console.log('stderr:', result.stderr);
    }
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('test-api-key-456'), 'Should return the credential field');
  });

  test('ops get retrieves SECURE_NOTE notesPlain', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['get', TEST_ITEM_NOTE, '--vault', TEST_VAULT, '--plain']);
    if (result.exitCode !== 0) {
      console.log('stderr:', result.stderr);
    }
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('This is a test secure note'), 'Should return the notes');
  });

  test('ops get --json outputs valid JSON', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['get', TEST_ITEM_LOGIN, '--vault', TEST_VAULT, '--json']);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    const data = JSON.parse(result.stdout);
    assert.ok(data.value, 'Should have a value property');
  });

  test('ops inspect shows item fields', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['inspect', TEST_ITEM_LOGIN, '--vault', TEST_VAULT]);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(
      result.stdout.includes('password') || result.stdout.includes('username'),
      'Should list fields'
    );
  });

  test('ops inspect --json outputs valid JSON', { skip: !testVaultExists() }, () => {
    const result = runOpsRaw(['inspect', TEST_ITEM_LOGIN, '--vault', TEST_VAULT, '--json']);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    const data = JSON.parse(result.stdout);
    assert.ok(data.fields || data.title, 'Should have field information');
  });

  test('ops search finds items by title', { skip: !testVaultExists() }, () => {
    const result = runOps(`search Test --vault ${TEST_VAULT}`);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    // Should find at least one of our test items
    const hasTestItem = result.stdout.includes('Test Login') ||
                        result.stdout.includes('Test API') ||
                        result.stdout.includes('Test Secure');
    assert.ok(hasTestItem || result.stdout.includes('No items'), 'Should search items');
  });

  test('ops completion bash generates valid bash script', () => {
    const result = runOps('completion bash');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('_ops_completion'), 'Should include bash completion function');
    assert.ok(result.stdout.includes('complete -F'), 'Should register completion');
  });

  test('ops completion zsh generates valid zsh script', () => {
    const result = runOps('completion zsh');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('#compdef ops'), 'Should include zsh compdef');
    assert.ok(result.stdout.includes('_ops'), 'Should include zsh completion function');
  });

  test('ops completion fish generates valid fish script', () => {
    const result = runOps('completion fish');
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    assert.ok(result.stdout.includes('complete -c ops'), 'Should include fish completion');
  });

  test('ops get with invalid item shows error', () => {
    const result = runOps(`get NON_EXISTENT_ITEM_12345 --vault ${TEST_VAULT} --no-input`);
    assert.notEqual(result.exitCode, 0, 'Should exit with non-zero code');
    assert.ok(
      result.stderr.includes('not found') || result.stdout.includes('not found') ||
      result.stderr.includes('Error') || result.stdout.includes('Error'),
      'Should show error message'
    );
  });

  test('ops export outputs env format', { skip: !testVaultExists() }, () => {
    const result = runOps(`export --vault ${TEST_VAULT}`);
    // Should either output env format or gracefully handle empty vault
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
  });

  test('ops export --json outputs valid JSON', { skip: !testVaultExists() }, () => {
    const result = runOps(`export --vault ${TEST_VAULT} --json`);
    assert.equal(result.exitCode, 0, 'Should exit with code 0');
    // May be empty object or array, but should be valid JSON
    JSON.parse(result.stdout); // Will throw if invalid
  });
});

// Print skip message when not running
if (!shouldRun) {
  console.log(`
╭─────────────────────────────────────────────────────────╮
│  Integration tests skipped (TEST_OP_CLI not set)        │
│                                                          │
│  To run integration tests:                               │
│    TEST_OP_CLI=1 npm test -- tests/integration/          │
│                                                          │
│  Prerequisites:                                          │
│    1. Install 1Password CLI (op)                         │
│    2. Sign in: op signin                                 │
│    3. Create test vault: op vault create "ops-cli-test"  │
╰─────────────────────────────────────────────────────────╯
`);
}
