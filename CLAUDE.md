# Vaultkeep Development Guide

## Project Overview

Vaultkeep (`ops` command) is a 1Password CLI wrapper providing smart secret retrieval with auto-prompts and field detection. Published to npm as `dc-ops-cli`.

## Tech Stack

- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Node.js 22+
- **Package Manager**: npm
- **Test Framework**: Node.js native test runner (`node:test`)
- **Build**: TypeScript compiler (`tsc`)
- **Release**: semantic-release with Conventional Commits

## Quality Gates

Run before any commit:

```bash
npm run typecheck    # TypeScript type checking
npm run build        # Compile to dist/
npm test             # Run all tests
```

All three must pass before pushing.

## Commit Convention (Conventional Commits)

**Format**: `<type>: <description>`

| Type | Release | Example |
|------|---------|---------|
| `fix:` | Patch (1.0.x) | `fix: handle empty vault response` |
| `feat:` | Minor (1.x.0) | `feat: add bulk import command` |
| `feat!:` | Major (x.0.0) | `feat!: change default vault behavior` |
| `docs:` | None | `docs: update README examples` |
| `chore:` | None | `chore: update dependencies` |
| `refactor:` | None | `refactor: simplify error handling` |
| `test:` | None | `test: add copy command tests` |

**Breaking changes** use `!` suffix OR include `BREAKING CHANGE:` in body.

## Deploy/Release Process

### Automated Release (Default)

1. **Make changes** on a feature branch or directly on master
2. **Run quality gates**:
   ```bash
   npm run typecheck && npm run build && npm test
   ```
3. **Commit with conventional format**:
   ```bash
   git commit -m "feat: add new command"
   ```
4. **Push to master**:
   ```bash
   git push origin master
   ```
5. **CI handles everything**:
   - Runs typecheck, build, test
   - semantic-release analyzes commits
   - Bumps version in package.json
   - Updates CHANGELOG.md
   - Creates GitHub release
   - Publishes to npm

### CI Workflows

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci.yml` | Push/PR to master | typecheck → build → test |
| `release.yml` | Push to master | typecheck → build → test → semantic-release |

### Manual Release (Not Recommended)

```bash
npm run release      # Dry-run to preview
npm run release:ci   # Actual release (CI only)
```

## Project Structure

```
vaultkeep/
├── src/
│   ├── index.ts           # CLI entry point (commander setup)
│   ├── commands/          # Command implementations
│   │   ├── get.ts         # ops get
│   │   ├── set.ts         # ops set
│   │   ├── copy.ts        # ops copy
│   │   ├── list.ts        # ops list
│   │   ├── export.ts      # ops export
│   │   ├── import.ts      # ops import
│   │   ├── run.ts         # ops run
│   │   ├── inspect.ts     # ops inspect
│   │   ├── resolve.ts     # ops resolve
│   │   └── vaults.ts      # ops vaults
│   └── utils/
│       ├── op.ts          # 1Password CLI wrapper
│       ├── cli.ts         # CLI helpers (colors, spinners)
│       ├── io.ts          # File I/O utilities
│       └── types.ts       # TypeScript interfaces
├── tests/
│   ├── commands/          # Command tests
│   └── utils/             # Utility tests
└── dist/                  # Compiled output (gitignored)
```

## Adding a New Command

1. **Create command file** `src/commands/newcmd.ts`:
   ```typescript
   export interface NewcmdOptions { vault?: string; /* ... */ }
   export interface NewcmdDependencies { /* injectable deps */ }

   export function createNewcmdCommand(deps = defaultDeps) {
     return async function newcmdCommand(arg: string, options: NewcmdOptions) {
       // Implementation
     }
   }
   ```

2. **Register in index.ts**:
   ```typescript
   import { createNewcmdCommand } from './commands/newcmd.js';
   program.command('newcmd <arg>').action(createNewcmdCommand());
   ```

3. **Add tests** `tests/commands/newcmd.test.ts`

4. **Run quality gates** and commit with `feat:` prefix

## Testing Pattern

All commands use dependency injection for testability:

```typescript
// In tests, inject mocks:
const cmd = createGetCommand({
  getSecret: () => 'mocked-value',
  setSecret: () => {},
  checkOpCli: () => true,
});
await cmd('SECRET_NAME', { silent: true });
```

## Common Tasks

| Task | Command |
|------|---------|
| Dev mode | `npm run dev -- get TOKEN` |
| Type check | `npm run typecheck` |
| Build | `npm run build` |
| Test | `npm test` |
| Test single file | `node --test tests/commands/get.test.ts` |
| Link globally | `npm link` |
