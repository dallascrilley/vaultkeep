# Technical Documentation

Developer and architecture documentation for `op-cli-helper`.

## Table of Contents

- [Architecture](#architecture)
- [Code Structure](#code-structure)
- [Core Components](#core-components)
- [Development Workflow](#development-workflow)
- [Contributing](#contributing)
- [Testing Strategy](#testing-strategy)
- [Build & Release](#build--release)

## Architecture

### Overview

`op-cli-helper` is a TypeScript CLI wrapper around the 1Password CLI (`op`), providing:

1. **Smart fallback prompts** - Auto-create secrets if not found
2. **Service account support** - Reads `OP_SERVICE_ACCOUNT_TOKEN` from `~/.config/op/sa_token`
3. **Interactive UX** - Colored output, spinners, prompts, and fuzzy browsing
4. **Templates** - Create common secret sets in one command
5. **Multiple interfaces** - Get/set/list/export/run/template commands

### Design Principles

- **Thin wrapper** - Delegates all 1Password operations to `op` CLI
- **Minimal local state** - Optional session and template caches in `~/.config/ops-cli`
- **Fail-fast** - Validate `op` CLI availability upfront
- **Secure by default** - Never log/expose secret values
- **Agent-friendly** - Supports silent mode for scripting

### Dependencies

| Package | Purpose | Why |
|---------|---------|-----|
| `commander` | CLI framework | Robust arg parsing, help generation |
| `inquirer` | Interactive prompts | Type-safe prompt library |
| `inquirer-autocomplete-prompt` | Fuzzy selection | Interactive browsing |
| `chalk` | Terminal colors | Better UX with colored output |
| `ora` | Spinners | Visual feedback for async ops |

## Code Structure

```
op-cli-helper/
├── src/
│   ├── index.ts              # CLI entry point, command registration
│   ├── commands/             # Command implementations
│   │   ├── get.ts            # Get/create secrets
│   │   ├── set.ts            # Store secrets
│   │   ├── template.ts       # Template management
│   │   ├── interactive.ts    # Fuzzy interactive mode
│   │   ├── list.ts           # List vault items
│   │   └── export.ts         # Export to .env/JSON
│   ├── templates/            # Built-in template definitions
│   └── utils/
│       ├── op.ts             # 1Password CLI wrapper functions
│       ├── templates.ts      # Template store + parsing
│       ├── session-cache.ts  # Local session caching
│       ├── env-mapping.ts    # Env mapping validation
│       └── types.ts          # TypeScript types & error classes
├── dist/                     # Compiled JavaScript (git-ignored)
└── docs/                     # Technical documentation
```

### Module Boundaries

- **`index.ts`** - CLI definition only, no business logic
- **`commands/`** - User-facing commands, handles I/O and prompts
- **`utils/op.ts`** - Pure 1Password CLI operations, no UI
- **`utils/types.ts`** - Shared types and error classes

## Core Components

### 1. Entry Point (`src/index.ts`)

**Responsibility**: CLI setup and command registration

```typescript
// Register commands with Commander.js
program
  .command('get <name>')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .action(getCommand);
```

**Key patterns**:
- Commander-based routing
- Global error handlers for uncaught exceptions
- Version and help text

### 2. Command Layer (`src/commands/`)

**Responsibility**: User interaction, orchestration, validation

Each command follows this pattern:

```typescript
export async function commandName(
  args: string,
  options: CommandOptions
): Promise<void> {
  try {
    checkOpCli();                    // Validate environment
    const spinner = ora('...').start(); // Visual feedback

    // Call utils/op.ts functions
    const result = utilFunction(args, options);

    spinner.succeed('Done!');
    console.log(result);             // Output to user
  } catch (error) {
    handleError(error);              // User-friendly errors
  }
}
```

**Design notes**:
- Async/await for all I/O operations
- Spinners for long-running ops
- Silent mode support for scripting
- Interactive fallback prompts

### 3. 1Password Wrapper (`src/utils/op.ts`)

**Responsibility**: Execute `op` CLI commands

**Key functions**:

#### `checkOpCli()`
Validates `op` CLI is installed and user is authenticated.

```typescript
export function checkOpCli(): void
```

Throws `OpError` if:
- `op` binary not found
- User not signed in (`op account list` fails)

#### `getSecret()`
Retrieve a secret by reference.

```typescript
export function getSecret(
  reference: string,
  vault: string = 'Private',
  field: string = 'password'
): string | null
```

**Supports**:
- Direct references: `op://vault/item/field`
- Constructed references: `op://Private/GITHUB_TOKEN/password`

**Returns**: Secret value or `null` if not found

#### `setSecret()`
Create or update a secret.

```typescript
export function setSecret(
  title: string,
  value: string,
  vault: string = 'Private',
  field: string = 'password'
): void
```

**Behavior**:
- Checks if item exists (via `getSecret`)
- Updates existing item with `op item edit`
- Creates new item with `op item create`

#### `listItems()`
List all items in a vault.

```typescript
export function listItems(vault: string = 'Private'): OpItem[]
```

**Returns**: Array of `OpItem` objects

#### `searchItems()`
Filter items by title.

```typescript
export function searchItems(query: string, vault: string = 'Private'): OpItem[]
```

**Implementation**: Client-side filtering of `listItems()` results

#### Service Account Token Support

Automatically loads token from `~/.config/op/sa_token`:

```typescript
function loadServiceAccountToken(): string | undefined
function getOpEnv(): NodeJS.ProcessEnv  // Injects OP_SERVICE_ACCOUNT_TOKEN
```

All `execSync` calls use `getOpEnv()` to include token if available.

### 4. Types (`src/utils/types.ts`)

**Key types**:

```typescript
// 1Password item structure
export interface OpItem {
  id: string;
  title: string;
  vault: string;
  category: string;
  fields?: OpField[];
}

// Custom error class with exit codes
export class OpError extends Error {
  constructor(message: string, public exitCode: number = 1)
}
```

## Development Workflow

### Setup

```bash
# Install dependencies
npm install

# Link for local testing
npm link

# Test commands
ops get TEST_SECRET
```

### Development Loop

```bash
# Run in dev mode (no build)
npm run dev -- get GITHUB_TOKEN

# Type check
npm run typecheck

# Build
npm run build

# Test built version
node dist/index.js get TEST_SECRET
```

### Code Style

- **TypeScript strict mode** enabled
- **ES modules** (`type: "module"` in package.json)
- **Node 18+** required
- **Async/await** over callbacks/promises.then()

### Debugging

```bash
# Verbose 1Password CLI output
DEBUG=1 ops get SECRET

# Node.js debugging
node --inspect dist/index.js get SECRET
```

## Contributing

### Guidelines

1. **Keep commands simple** - One responsibility per command
2. **No side effects in utils** - Pure functions in `utils/op.ts`
3. **Silent mode support** - All commands must support `--silent` for piping
4. **Secure by default** - Never log secret values
5. **Error messages** - Clear, actionable error messages

### Adding a New Command

1. **Create command file**: `src/commands/my-command.ts`

```typescript
import { checkOpCli } from '../utils/op.js';

export async function myCommand(args: string, options: Options): Promise<void> {
  checkOpCli();
  // Implementation
}
```

2. **Register in index.ts**:

```typescript
import { myCommand } from './commands/my-command.js';

program
  .command('my-command <arg>')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .action(myCommand);
```

3. **Add types to `utils/types.ts`** if needed

4. **Update main README** with usage examples

### Adding a New Utility Function

1. **Add to `src/utils/op.ts`**:

```typescript
export function myOpFunction(args: string): Result {
  const env = getOpEnv();  // Include service account token
  const output = execSync(`op command ...`, { env, stdio: 'pipe' });
  return JSON.parse(output);
}
```

2. **Follow existing patterns**:
   - Use `getOpEnv()` for all `execSync` calls
   - Return typed results
   - Throw `OpError` on failures
   - No console output in utils (commands handle output)

## Testing Strategy

### Current State

**Status**: Automated tests in place (unit + integration)

#### Unit Tests

```bash
npm run test
```

**Coverage targets**:
- `utils/op.ts` - Mock `execSync` calls
- Command logic - Test with fake op CLI responses
- Error handling - Validate `OpError` behavior

#### Integration Tests

Test against real 1Password CLI with test vault:

```bash
# Setup test vault
op vault create "ops-test-vault"

# Run integration tests
npm run test:integration
```

#### Manual Testing Checklist

Before release:
- [ ] `ops get` with existing secret
- [ ] `ops get` with non-existent secret (prompt flow)
- [ ] `ops set` create new
- [ ] `ops set` update existing
- [ ] `ops list` default vault
- [ ] `ops list --search`
- [ ] `ops export` to stdout
- [ ] `ops export --output file`
- [ ] `ops template apply api` (prompts for values)
- [ ] Service account token support
- [ ] Silent mode (piping)

## Build & Release

### Build Process

```bash
# Type check
npm run typecheck

# Compile TypeScript
npm run build

# Output: dist/index.js with source maps
```

**Build outputs**:
- `dist/index.js` - Executable entry point
- `dist/**/*.js.map` - Source maps
- `dist/**/*.d.ts` - Type definitions

### Release Checklist

1. **Version bump**: Update `package.json` version
2. **Quality gates**: Run typecheck + manual tests
3. **Build**: `npm run build`
4. **Publish**: `npm publish` (or package for distribution)
5. **Tag**: `git tag v1.x.x && git push --tags`

### Distribution Options

**Option A: npm package**
```bash
npm publish
npm install -g op-cli-helper
```

**Option B: Standalone binary**
```bash
# Use pkg or similar to bundle Node.js
pkg dist/index.js --output ops
```

**Option C: Local install**
```bash
npm link  # Development
npm install -g .  # Production
```

## Architecture Decisions

### Why TypeScript?
- Type safety for CLI arguments and 1Password responses
- Better tooling and editor support
- Catches errors at compile time

### Why Commander.js?
- De-facto standard for Node.js CLIs
- Auto-generates help text
- Clean option/argument parsing

### Why Inquirer?
- Type-safe prompts
- Password masking
- Validation support
- Consistent UX

### Why Wrap `op` CLI vs. Use API?
- CLI is officially supported and stable
- No API key management needed
- Inherits all auth flows (biometric, service accounts, etc.)
- Simpler implementation

## Troubleshooting

### Common Issues

**`op CLI not found`**
- Install from: https://1password.com/downloads/command-line/
- Verify: `which op`

**`Not signed in to 1Password`**
- Run: `op signin`
- Or: Place service account token in `~/.config/op/sa_token`

**`Vault "X" not found`**
- List vaults: `op vault list`
- Check spelling and permissions

**TypeScript errors during build**
- Run: `npm run typecheck` for detailed errors
- Check `tsconfig.json` configuration

### Debug Mode

```bash
# Enable verbose op CLI output
export DEBUG=1
ops get SECRET

# Node.js debugging
node --inspect-brk dist/index.js get SECRET
```

## Future Enhancements

### Planned Features
- [ ] Secret templates for common patterns
- [ ] Diff command to compare secrets between vaults/environments
- [ ] Upgrade to Node 22 native APIs
- [ ] Template-based export (`.env.template`)
- [ ] Encrypted local cache (optional)

### Contribution Ideas
- Add `ops delete <name>` command
- Support for document/file secrets
- Multi-vault batch export
- Vault creation/management
- Share/permissions management

## License

MIT - See `LICENSE` file for details.

---

**Questions?** Open an issue or see main [README](../README.md) for user documentation.
