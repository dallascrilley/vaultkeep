# Vaultkeep Agent Instructions

Quick reference for AI coding agents working on this project.

## Before Any Code Change

```bash
npm run typecheck && npm run build && npm test
```

All must pass before committing.

## Commit Format (Required)

```
<type>: <description>
```

| Type | Triggers Release | Use For |
|------|------------------|---------|
| `fix:` | Patch | Bug fixes |
| `feat:` | Minor | New features |
| `feat!:` | Major | Breaking changes |
| `docs:` | No | Documentation only |
| `chore:` | No | Maintenance |
| `refactor:` | No | Code restructuring |
| `test:` | No | Test changes |

## Release Workflow

**Automated** - just push to master:

```bash
# 1. Verify quality gates pass
npm run typecheck && npm run build && npm test

# 2. Commit with conventional format
git add .
git commit -m "feat: add new capability"

# 3. Push - CI handles versioning, changelog, npm publish
git push origin master
```

**CI Pipeline**:
1. Runs typecheck, build, test
2. semantic-release analyzes commit messages
3. Determines version bump (patch/minor/major)
4. Updates package.json, CHANGELOG.md
5. Creates GitHub release
6. Publishes to npm as `dc-ops-cli`

## Do NOT

- Manually bump version in package.json
- Manually edit CHANGELOG.md
- Use non-conventional commit messages
- Push failing code to master
- Force push to master

## Adding Features

1. Create `src/commands/newcmd.ts` with dependency injection pattern
2. Register in `src/index.ts`
3. Add tests in `tests/commands/newcmd.test.ts`
4. Run quality gates
5. Commit with `feat:` prefix

## Command Pattern

```typescript
export interface CmdOptions { vault?: string; }
export interface CmdDependencies { getSecret: Function; }

const defaultDeps: CmdDependencies = { getSecret: realGetSecret };

export function createCmdCommand(deps = defaultDeps) {
  return async function cmdCommand(name: string, opts: CmdOptions) {
    // Implementation using deps (injectable for testing)
  };
}
```

## Testing

```bash
npm test                              # All tests
node --test tests/commands/get.test.ts  # Single file
```

Inject mock dependencies in tests - never call real 1Password CLI.
