# ops CLI UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve critical UX friction points identified in TESTING_REPORT.md to make the ops CLI more discoverable and user-friendly.

**Architecture:** Extend existing command structure with new commands (`inspect`, `vaults`) and enhance existing commands with field discovery, suggestions, verbose output, dry-run modes, and path validation. All new features follow the existing dependency injection pattern for testability.

**Tech Stack:** TypeScript, Commander.js, Node.js built-in test runner, 1Password CLI (`op`)

---

## Task 1: Add `getItemFields()` Function to op.ts

**Files:**
- Modify: `src/utils/op.ts:358-370`
- Test: `tests/utils/op.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/utils/op.test.ts`:

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// We'll test getItemFields returns field labels from an item
test('getItemFields returns field labels from item', async () => {
  // This test will fail until we implement getItemFields
  const { getItemFields } = await import('../../src/utils/op.js');

  // Mock implementation will be injected during actual test setup
  assert.ok(typeof getItemFields === 'function', 'getItemFields should be exported');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/utils/op.test.ts`
Expected: FAIL with "getItemFields is not exported" or similar

**Step 3: Write minimal implementation**

Add to `src/utils/op.ts` after `getItem()` function (~line 370):

```typescript
/**
 * Get available field labels for an item
 */
export function getItemFields(title: string, vault: string = 'Private'): string[] {
  const item = getItem(title, vault);
  if (!item?.fields) return [];

  return item.fields
    .filter((f) => f.label && f.label.length > 0)
    .map((f) => f.label);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/utils/op.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/op.ts tests/utils/op.test.ts
git commit -m "$(cat <<'EOF'
feat(op): add getItemFields() for field discovery

Enables listing available field names for a 1Password item,
which will power the ops inspect command and improved error messages.
EOF
)"
```

---

## Task 2: Create `ops inspect` Command

**Files:**
- Create: `src/commands/inspect.ts`
- Modify: `src/index.ts:1-20` (add import and command registration)
- Test: `tests/commands/inspect.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/commands/inspect.test.ts`:

```typescript
import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createInspectCommand } from '../../src/commands/inspect.js';
import type { OpItem, OpField } from '../../src/utils/types.js';

const consoleOutput: string[] = [];

function buildInspectCommand(item: OpItem | null = null) {
  return createInspectCommand({
    getItem: () => item,
    checkOpCli: () => {},
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    }) as any,
    resolveBooleanOption: () => false,
    resolveVault: (v?: string) => v ?? 'Private',
    log: (msg: string) => consoleOutput.push(msg),
  });
}

afterEach(() => {
  consoleOutput.length = 0;
});

test('inspect shows item fields', async () => {
  const mockItem: OpItem = {
    id: '123',
    title: 'GitHub PAT',
    vault: 'Private',
    category: 'API_CREDENTIAL',
    fields: [
      { id: 'token', type: 'CONCEALED', label: 'token', value: 'secret' },
      { id: 'username', type: 'STRING', label: 'username', value: 'user' },
    ],
  };

  const inspectCommand = buildInspectCommand(mockItem);
  await inspectCommand('GitHub PAT', {});

  assert.ok(consoleOutput.some((line) => line.includes('token')));
  assert.ok(consoleOutput.some((line) => line.includes('username')));
});

test('inspect fails when item not found', async () => {
  const inspectCommand = buildInspectCommand(null);

  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  await assert.rejects(() => inspectCommand('MISSING', {}), /process\.exit/);
  assert.equal(exitCalls[0], 1);

  exitMock.mock.restore();
  errorMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/commands/inspect.test.ts`
Expected: FAIL with "Cannot find module" error

**Step 3: Write minimal implementation**

Create `src/commands/inspect.ts`:

```typescript
import chalk from 'chalk';
import { getItem, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
} from '../utils/cli.js';
import { OpError, OpItem } from '../utils/types.js';

export interface InspectOptions {
  vault?: string;
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface InspectDependencies {
  getItem: typeof getItem;
  checkOpCli: typeof checkOpCli;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  log: (message: string) => void;
}

const defaultDependencies: InspectDependencies = {
  getItem,
  checkOpCli,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
  log: console.log,
};

export function createInspectCommand(
  overrides: Partial<InspectDependencies> = {}
): (name: string, options: InspectOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function inspectCommand(
    name: string,
    options: InspectOptions
  ): Promise<void> {
    try {
      deps.checkOpCli();

      const vault = deps.resolveVault(options.vault);
      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner(`Inspecting "${name}"...`, quiet);

      const item = deps.getItem(name, vault);

      if (!item) {
        spinner.fail(chalk.yellow(`Item "${name}" not found in vault "${vault}"`));
        throw new OpError(`Item not found. Use ops list to see available items.`, 1);
      }

      spinner.stop();

      if (options.json) {
        deps.log(JSON.stringify({
          title: item.title,
          vault: item.vault || vault,
          category: item.category,
          fields: item.fields?.map((f) => ({
            label: f.label,
            type: f.type,
            id: f.id,
          })) || [],
        }, null, 2));
        return;
      }

      deps.log(chalk.cyan(`\nItem: ${chalk.white(item.title)}`));
      deps.log(chalk.cyan(`Vault: ${chalk.white(item.vault || vault)}`));
      deps.log(chalk.cyan(`Category: ${chalk.white(item.category)}`));
      deps.log(chalk.cyan('\nFields:'));

      if (!item.fields || item.fields.length === 0) {
        deps.log(chalk.gray('  (no fields)'));
        return;
      }

      for (const field of item.fields) {
        if (field.label) {
          deps.log(chalk.white(`  - ${field.label} ${chalk.gray(`(${field.type})`)}`));
        }
      }
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const inspectCommand = createInspectCommand();
```

**Step 4: Register the command in index.ts**

Add import at top of `src/index.ts`:

```typescript
import { inspectCommand } from './commands/inspect.js';
```

Add command registration after the `get` command block (~line 40):

```typescript
program
  .command('inspect <name>')
  .description('Inspect an item to see available fields')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(inspectCommand);
```

**Step 5: Run test to verify it passes**

Run: `npm test tests/commands/inspect.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/commands/inspect.ts src/index.ts tests/commands/inspect.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add ops inspect command for field discovery

Users can now run `ops inspect <name>` to see all available fields
for a 1Password item, eliminating guesswork when the default
'password' field doesn't exist.

Usage:
  ops inspect "GitHub PAT"
  ops inspect "GitHub PAT" --json
EOF
)"
```

---

## Task 3: Enhance `get` Command Error Messages with Field Suggestions

**Files:**
- Modify: `src/commands/get.ts:117-126`
- Modify: `src/commands/get.ts:24-37` (add getItemFields to dependencies)
- Test: `tests/commands/get.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/commands/get.test.ts`:

```typescript
import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createGetCommand } from '../../src/commands/get.js';

const consoleOutput: string[] = [];
let secretValue: string | null = null;
let itemExists = true;
let itemFields: string[] = ['token', 'username', 'notes'];

function buildGetCommand() {
  return createGetCommand({
    getSecret: () => secretValue,
    setSecret: () => {},
    checkOpCli: () => {},
    itemExists: () => itemExists,
    getItemFields: () => itemFields,
    prompt: async () => ({ create: false }),
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: (msg?: string) => { if (msg) consoleOutput.push(msg); },
      stop: () => {},
    }) as any,
    isInteractiveInput: () => false,
    resolveBooleanOption: () => false,
    resolveField: (v?: string) => v ?? 'password',
    resolveVault: (v?: string) => v ?? 'Private',
  });
}

afterEach(() => {
  consoleOutput.length = 0;
  secretValue = null;
  itemExists = true;
  itemFields = ['token', 'username', 'notes'];
});

test('suggests available fields when field not found', async () => {
  secretValue = null;
  itemExists = true;
  itemFields = ['token', 'credential', 'notes'];

  const getCommand = buildGetCommand();

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });

  await assert.rejects(() => getCommand('GitHub PAT', {}), /process\.exit/);

  // Should suggest available fields
  const allOutput = [...consoleOutput, ...errorOutput].join(' ');
  assert.ok(
    allOutput.includes('token') || allOutput.includes('Available fields'),
    `Expected field suggestions in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/commands/get.test.ts`
Expected: FAIL - getItemFields not in dependencies or field suggestions not shown

**Step 3: Update get.ts dependencies and error handling**

Modify `src/commands/get.ts`:

Add import:
```typescript
import { getSecret, setSecret, checkOpCli, itemExists, getItemFields } from '../utils/op.js';
```

Update `GetDependencies` interface (add after line 29):
```typescript
  getItemFields: typeof getItemFields;
```

Update `defaultDependencies` (add after line 44):
```typescript
  getItemFields,
```

Replace the field-not-found error block (~lines 120-125) with:
```typescript
      if (exists) {
        // Item exists but field not found - suggest available fields
        const fields = deps.getItemFields(name, vault);
        if (!quietSpinner) {
          spinner.fail(chalk.yellow(`Field "${field}" not found on item "${name}"`));
        }

        let errorMessage = `Field "${field}" not found.`;
        if (fields.length > 0) {
          errorMessage += ` Available fields: ${fields.join(', ')}`;
          errorMessage += `\nTry: ops get "${name}" --field ${fields[0]}`;
        } else {
          errorMessage += ` Use: ops inspect "${name}" to see available fields.`;
        }
        throw new OpError(errorMessage, 1);
      }
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/commands/get.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/commands/get.ts tests/commands/get.test.ts
git commit -m "$(cat <<'EOF'
feat(get): suggest available fields when field not found

When ops get fails because the requested field doesn't exist,
the error now shows available fields and suggests a command:

  Error: Field "password" not found. Available fields: token, username
  Try: ops get "GitHub PAT" --field token
EOF
)"
```

---

## Task 4: Add `ops vaults` Command

**Files:**
- Create: `src/commands/vaults.ts`
- Modify: `src/utils/op.ts` (add listVaults function)
- Modify: `src/index.ts` (register command)
- Test: `tests/commands/vaults.test.ts` (create)

**Step 1: Write the failing test for listVaults**

Create `tests/commands/vaults.test.ts`:

```typescript
import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createVaultsCommand } from '../../src/commands/vaults.js';

const consoleOutput: string[] = [];

interface MockVault {
  id: string;
  name: string;
  type: string;
}

let mockVaults: MockVault[] = [
  { id: '1', name: 'Private', type: 'USER_CREATED' },
  { id: '2', name: 'Work', type: 'SHARED' },
];

function buildVaultsCommand() {
  return createVaultsCommand({
    listVaults: () => mockVaults,
    checkOpCli: () => {},
    applyColorConfig: () => {},
    createSpinner: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    }) as any,
    resolveBooleanOption: () => false,
    log: (msg: string) => consoleOutput.push(msg),
  });
}

afterEach(() => {
  consoleOutput.length = 0;
  mockVaults = [
    { id: '1', name: 'Private', type: 'USER_CREATED' },
    { id: '2', name: 'Work', type: 'SHARED' },
  ];
});

test('vaults lists available vaults', async () => {
  const vaultsCommand = buildVaultsCommand();
  await vaultsCommand({});

  assert.ok(consoleOutput.some((line) => line.includes('Private')));
  assert.ok(consoleOutput.some((line) => line.includes('Work')));
});

test('vaults outputs JSON when --json flag is set', async () => {
  const vaultsCommand = buildVaultsCommand();
  await vaultsCommand({ json: true });

  const jsonOutput = consoleOutput.find((line) => line.startsWith('['));
  assert.ok(jsonOutput, 'Should output JSON array');
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.length, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/commands/vaults.test.ts`
Expected: FAIL - module not found

**Step 3: Add listVaults to op.ts**

Add to `src/utils/op.ts` after `searchItems()`:

```typescript
export interface OpVault {
  id: string;
  name: string;
  type: string;
}

/**
 * List all vaults accessible to the user
 */
export function listVaults(): OpVault[] {
  const env = getOpEnv();

  try {
    const output = execSync('op vault list --format=json', {
      encoding: 'utf-8',
      stdio: 'pipe',
      env,
    });
    return JSON.parse(output);
  } catch (error: any) {
    throw new OpError(`Failed to list vaults: ${error.message}`, 1);
  }
}
```

**Step 4: Create vaults command**

Create `src/commands/vaults.ts`:

```typescript
import chalk from 'chalk';
import { listVaults, checkOpCli } from '../utils/op.js';
import type { OpVault } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface VaultsOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface VaultsDependencies {
  listVaults: typeof listVaults;
  checkOpCli: typeof checkOpCli;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  log: (message: string) => void;
}

const defaultDependencies: VaultsDependencies = {
  listVaults,
  checkOpCli,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  log: console.log,
};

export function createVaultsCommand(
  overrides: Partial<VaultsDependencies> = {}
): (options: VaultsOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function vaultsCommand(options: VaultsOptions): Promise<void> {
    try {
      deps.checkOpCli();

      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner('Fetching vaults...', quiet || options.json);

      const vaults = deps.listVaults();

      spinner.stop();

      if (options.json) {
        deps.log(JSON.stringify(vaults, null, 2));
        return;
      }

      if (vaults.length === 0) {
        deps.log(chalk.yellow('No vaults found.'));
        return;
      }

      deps.log(chalk.cyan('\nAvailable vaults:\n'));
      deps.log(chalk.gray('  Name                Type'));
      deps.log(chalk.gray('  ─────────────────   ─────────────'));

      for (const vault of vaults) {
        const name = vault.name.padEnd(18);
        const type = vault.type || 'UNKNOWN';
        deps.log(`  ${chalk.white(name)} ${chalk.gray(type)}`);
      }

      deps.log('');
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const vaultsCommand = createVaultsCommand();
```

**Step 5: Register command in index.ts**

Add import:
```typescript
import { vaultsCommand } from './commands/vaults.js';
```

Add command after `favorites`:
```typescript
program
  .command('vaults')
  .description('List all available vaults')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(vaultsCommand);
```

**Step 6: Run tests**

Run: `npm test tests/commands/vaults.test.ts`
Expected: PASS

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/utils/op.ts src/commands/vaults.ts src/index.ts tests/commands/vaults.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add ops vaults command to list available vaults

Users can now discover vault names without using the 1Password app:

  ops vaults
  ops vaults --json
EOF
)"
```

---

## Task 5: Add `--verbose` Flag to `ops run`

**Files:**
- Modify: `src/commands/run.ts:14-21` (add verbose option)
- Modify: `src/commands/run.ts:134-156` (add verbose logging)
- Modify: `src/index.ts` (add --verbose flag)
- Test: `tests/commands/run.test.ts` (add verbose test)

**Step 1: Write the failing test**

Add to `tests/commands/run.test.ts`:

```typescript
test('run shows injected secrets with --verbose', async () => {
  const consoleOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    consoleOutput.push(msg);
  });

  // Build command with verbose dependency
  const runCommand = buildRunCommand();

  await runCommand(['echo', 'test'], {
    env: ['API_KEY=MY_SECRET'],
    verbose: true
  });

  assert.ok(
    consoleOutput.some((line) => line.includes('API_KEY') || line.includes('Injecting')),
    'Should show what is being injected'
  );

  logMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/commands/run.test.ts`
Expected: FAIL - verbose option not recognized

**Step 3: Update run.ts**

Add `verbose` to `RunOptions` interface:
```typescript
export interface RunOptions {
  vault?: string;
  field?: string;
  env?: string[];
  envFile?: string;
  verbose?: boolean;
  color?: boolean;
}
```

Add verbose logging after secrets are resolved (~line 149):
```typescript
      if (options.verbose) {
        console.log(chalk.cyan('[ops] Injecting environment variables:'));
        for (const [key] of resolvedEntries) {
          console.log(chalk.gray(`  ${key} ← (secret value hidden)`));
        }
        console.log(chalk.cyan(`[ops] Running: ${command.join(' ')}`));
      }
```

**Step 4: Add --verbose flag in index.ts**

Update the `run` command registration:
```typescript
  .option('--verbose', 'show which secrets are being injected')
```

**Step 5: Run tests**

Run: `npm test tests/commands/run.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/commands/run.ts src/index.ts tests/commands/run.test.ts
git commit -m "$(cat <<'EOF'
feat(run): add --verbose flag to show injected secrets

Users can now verify which secrets are being injected:

  ops run --verbose --env API_KEY=MY_SECRET -- node app.js
  [ops] Injecting environment variables:
    API_KEY ← (secret value hidden)
  [ops] Running: node app.js
EOF
)"
```

---

## Task 6: Validate Export Output Path Early

**Files:**
- Modify: `src/commands/export.ts:13-30` (add path validation)
- Test: Update existing export tests or add new

**Step 1: Write the failing test**

Add test case for invalid path:

```typescript
test('export fails early if output directory does not exist', async () => {
  const exitCalls: number[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', () => {});

  await assert.rejects(
    () => exportCommand({ output: '/nonexistent/dir/secrets.env' }),
    /process\.exit/
  );

  assert.equal(exitCalls[0], 2); // Exit code 2 for validation error

  exitMock.mock.restore();
  errorMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - currently validates after fetching secrets

**Step 3: Add early validation to export.ts**

Add imports at top:
```typescript
import { writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
```

Add validation after format resolution (~line 28):
```typescript
    // Validate output path early
    if (options.output && options.output !== '-') {
      const dir = dirname(options.output);
      if (!existsSync(dir)) {
        throw new OpError(`Output directory not found: ${dir}`, 2);
      }
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/export.ts
git commit -m "$(cat <<'EOF'
fix(export): validate output path before fetching secrets

Prevents wasted 1Password API calls when the output directory
doesn't exist. Fails fast with a clear error message.
EOF
)"
```

---

## Task 7: Add `--dry-run` Flag to `ops import`

**Files:**
- Modify: `src/commands/import.ts:14-18` (add dryRun option)
- Modify: `src/commands/import.ts:100-142` (skip actual create/update in dry-run)
- Modify: `src/index.ts` (add --dry-run flag)
- Test: `tests/commands/import.test.ts`

**Step 1: Write the failing test**

Add to `tests/commands/import.test.ts`:

```typescript
test('import --dry-run shows what would be imported without modifying', async () => {
  const consoleOutput: string[] = [];
  const createdItems: string[] = [];

  const importCommand = buildImportCommand({
    createItem: (title: string) => { createdItems.push(title); },
    // ... other mocks
  });

  await importCommand('test.env', { dryRun: true });

  // Should NOT have created anything
  assert.equal(createdItems.length, 0);

  // Should show what would be imported
  assert.ok(consoleOutput.some((line) =>
    line.includes('dry run') || line.includes('Would import')
  ));
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - dryRun option not recognized

**Step 3: Update import.ts**

Add to `ImportOptions`:
```typescript
export interface ImportOptions {
  vault?: string;
  dryRun?: boolean;
  quiet?: boolean;
  color?: boolean;
}
```

Update the import loop to check for dry-run (~line 106):
```typescript
      for (const [key, value] of entries) {
        spinner.text = options.dryRun
          ? `[DRY RUN] Checking ${key}...`
          : `Importing ${key}...`;

        const existing = deps.getItem(key, vault);

        if (existing) {
          if (options.dryRun) {
            updated.push(key);
            continue;
          }
          // ... existing prompt logic
        }

        if (options.dryRun) {
          imported.push(key);
          continue;
        }

        deps.createItem(key, value, vault, 'password');
        imported.push(key);
      }

      const dryRunPrefix = options.dryRun ? '[DRY RUN] ' : '';
      if (!quiet) {
        spinner.succeed(
          chalk.green(
            `${dryRunPrefix}Would import ${imported.length}, update ${updated.length}, skip ${skipped.length}.`
          )
        );
        // ... rest of report
      }
```

**Step 4: Add --dry-run flag in index.ts**

```typescript
  .option('--dry-run', 'preview what would be imported without making changes')
```

**Step 5: Run tests**

Run: `npm test tests/commands/import.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/commands/import.ts src/index.ts tests/commands/import.test.ts
git commit -m "$(cat <<'EOF'
feat(import): add --dry-run flag to preview imports

Users can now preview what would happen before importing:

  ops import secrets.env --dry-run
  [DRY RUN] Would import 3, update 1, skip 0.
EOF
)"
```

---

## Task 8: Add Clipboard Clear Confirmation

**Files:**
- Modify: `src/commands/copy.ts:96-105` (add clear confirmation log)

**Step 1: Write the failing test**

Add to `tests/commands/copy.test.ts`:

```typescript
test('copy logs when clipboard is cleared', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const consoleOutput: string[] = [];
  const logMock = mock.method(console, 'log', (msg: string) => {
    consoleOutput.push(msg);
  });

  const copyCommand = buildCopyCommand();
  await copyCommand('MY_SECRET', {});

  mock.timers.tick(30000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(
    consoleOutput.some((line) => line.includes('cleared') || line.includes('Clipboard')),
    'Should log when clipboard is cleared'
  );

  logMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - no clear confirmation

**Step 3: Update copy.ts**

Update the setTimeout callback (~line 96):
```typescript
      setTimeout(async () => {
        try {
          const current = await deps.clipboardRead();
          if (current === secret) {
            await deps.clipboardWrite('');
            if (!quiet) {
              console.log(chalk.gray('✓ Clipboard cleared'));
            }
          }
        } catch {
          // Best-effort clipboard cleanup.
        }
      }, ttlSeconds * 1000);
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/commands/copy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/copy.ts tests/commands/copy.test.ts
git commit -m "$(cat <<'EOF'
feat(copy): log confirmation when clipboard is cleared

Users now get visual feedback that the clipboard was cleared:

  ✓ Copied to clipboard! Will clear in 30s.
  ✓ Clipboard cleared
EOF
)"
```

---

## Task 9: Add Secret Name Suggestions on Typos

**Files:**
- Modify: `src/utils/op.ts` (add fuzzy match helper)
- Modify: `src/commands/get.ts:128-136` (suggest similar names)
- Modify: `src/commands/get.ts:24-37` (add searchItems dependency)

**Step 1: Write the failing test**

Add to `tests/commands/get.test.ts`:

```typescript
test('suggests similar secret names when not found', async () => {
  secretValue = null;
  itemExists = false;

  const mockItems = [
    { id: '1', title: 'GITHUB_TOKEN', vault: 'Private', category: 'PASSWORD' },
    { id: '2', title: 'GITHUB_PAT', vault: 'Private', category: 'API_CREDENTIAL' },
  ];

  const getCommand = createGetCommand({
    // ... existing mocks
    searchItems: () => mockItems,
  });

  const exitCalls: number[] = [];
  const errorOutput: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    exitCalls.push(code ?? 0);
    throw new Error('process.exit');
  });
  const errorMock = mock.method(console, 'error', (msg: string) => {
    errorOutput.push(msg);
  });

  // Typo: GITUB instead of GITHUB
  await assert.rejects(() => getCommand('GITUB_TOKEN', {}), /process\.exit/);

  const allOutput = errorOutput.join(' ');
  assert.ok(
    allOutput.includes('GITHUB_TOKEN') || allOutput.includes('Did you mean'),
    `Expected suggestions in output: ${allOutput}`
  );

  exitMock.mock.restore();
  errorMock.mock.restore();
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - no suggestions shown

**Step 3: Add fuzzy matching helper to op.ts**

```typescript
/**
 * Find similar item names using simple string matching
 */
export function findSimilarItems(
  query: string,
  vault: string = 'Private',
  maxResults: number = 3
): string[] {
  const items = listItems(vault);
  const queryLower = query.toLowerCase();

  // Score items by similarity
  const scored = items
    .map((item) => {
      const titleLower = item.title.toLowerCase();
      let score = 0;

      // Exact substring match
      if (titleLower.includes(queryLower) || queryLower.includes(titleLower)) {
        score += 50;
      }

      // Word overlap
      const queryWords = queryLower.split(/[_\-\s]+/);
      const titleWords = titleLower.split(/[_\-\s]+/);
      for (const qw of queryWords) {
        for (const tw of titleWords) {
          if (tw.includes(qw) || qw.includes(tw)) {
            score += 20;
          }
        }
      }

      // Character overlap ratio
      const commonChars = [...queryLower].filter((c) => titleLower.includes(c)).length;
      score += Math.floor((commonChars / queryLower.length) * 30);

      return { title: item.title, score };
    })
    .filter((item) => item.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((item) => item.title);
}
```

**Step 4: Update get.ts to suggest similar names**

Add to dependencies:
```typescript
  findSimilarItems: typeof findSimilarItems;
```

Update the "secret not found" block (~line 128):
```typescript
      if (!quietSpinner) {
        spinner.fail(chalk.yellow(`Secret "${name}" not found in vault "${vault}"`));
      }

      // Suggest similar names
      const similar = deps.findSimilarItems(name, vault);
      if (similar.length > 0 && !noInput) {
        console.log(chalk.cyan('\nDid you mean?'));
        for (const suggestion of similar) {
          console.log(chalk.white(`  - ${suggestion}`));
        }
      }
```

**Step 5: Run tests**

Run: `npm test tests/commands/get.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils/op.ts src/commands/get.ts tests/commands/get.test.ts
git commit -m "$(cat <<'EOF'
feat(get): suggest similar secret names on typos

When a secret is not found, ops now suggests similar names:

  $ ops get GITUB_TOKEN
  Secret "GITUB_TOKEN" not found in vault "Private"

  Did you mean?
    - GITHUB_TOKEN
    - GITHUB_PAT
EOF
)"
```

---

## Task 10: Final Integration Testing & Documentation

**Files:**
- Update: `README.md` (document new commands and flags)
- Update: `EXAMPLES.md` (add examples for new features)
- Run: Full integration test

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Build**

Run: `npm run build`
Expected: PASS

**Step 4: Manual smoke test**

```bash
# Test new commands
ops inspect "Some Item"
ops vaults
ops import test.env --dry-run
ops run --verbose --env API_KEY=test -- echo "works"
```

**Step 5: Update README.md**

Add new commands to the Commands section:

```markdown
### Inspect an Item

See available fields for a secret:

```bash
ops inspect "GitHub PAT"
ops inspect "GitHub PAT" --json
```

### List Vaults

Discover available vaults:

```bash
ops vaults
ops vaults --json
```
```

Document new flags in the relevant command sections.

**Step 6: Commit documentation**

```bash
git add README.md EXAMPLES.md
git commit -m "$(cat <<'EOF'
docs: document new commands and flags

- ops inspect: list available fields
- ops vaults: discover vault names
- --verbose flag for ops run
- --dry-run flag for ops import
- Improved error messages with field/name suggestions
EOF
)"
```

**Step 7: Final commit summary**

```bash
git log --oneline -10
```

---

## Summary of Changes

| Issue | Solution | Priority |
|-------|----------|----------|
| Field discovery problem | `ops inspect` command + improved error messages | HIGH |
| Missing ops inspect | New `inspect` command | HIGH |
| No vault listing | New `vaults` command | MEDIUM |
| run doesn't show injections | `--verbose` flag | MEDIUM |
| Export path validation | Early directory check | MEDIUM |
| Import no dry-run | `--dry-run` flag | MEDIUM |
| No name suggestions | Fuzzy matching on not-found | MEDIUM |
| TTL countdown missing | Log when clipboard clears | LOW |

**Total: 10 tasks, ~30 bite-sized steps**

---

## Execution Ready

Plan complete and saved to `docs/plans/2026-01-15-ops-cli-ux-improvements.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
