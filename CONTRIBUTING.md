# Contributing

Thanks for your interest in Vaultkeep. This document covers the local setup,
the checks that must pass, and the commit convention the release automation
depends on.

## Requirements

- Node.js `>=22` (declared in `engines`; CI runs 22)
- The 1Password CLI (`op`) on your `PATH` for anything that talks to a vault.
  Install it from <https://1password.com/downloads/command-line/>. The unit
  tests do not need it.

## Setup

```bash
npm ci
```

Run the CLI from source without building:

```bash
npm run dev -- --help
```

## Quality gates

All three must pass before you push:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc, compiles to dist/
npm test            # unit tests
```

`npm run lint` is an alias for `npm run typecheck`; there is no separate
linter.

`.github/workflows/ci.yml` runs exactly these three commands on Node 22 for
every pull request against `master`, so a clean local run should mean a clean
CI run.

### Integration tests

```bash
npm run test:integration
```

These are excluded from `npm test` because they shell out to a real `op`
binary. They build first and run with `TEST_OP_CLI=1`. You need the 1Password
CLI installed and signed in. `npm run test:all` runs unit then integration.

## Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/)
with [semantic-release](https://semantic-release.gitbook.io/). The commit type
determines the version bump, so it is not cosmetic.

| Type | Release | Example |
|------|---------|---------|
| `fix:` | Patch (1.0.x) | `fix: handle empty secrets correctly` |
| `feat:` | Minor (1.x.0) | `feat: add vault search command` |
| `feat!:` | Major (x.0.0) | `feat!: redesign API` |
| `docs:` | None | `docs: update README` |
| `chore:` | None | `chore: update dependencies` |
| `refactor:` | None | `refactor: simplify error handling` |
| `test:` | None | `test: add get command tests` |

Do **not** hand-edit any of the following. `.github/workflows/release.yml` runs
semantic-release on every push to `master` and owns them:

- the `version` field in `package.json`
- `CHANGELOG.md`
- GitHub releases
- npm publishes

## Pull requests

- Branch off `master` and open one PR per concern.
- Keep the diff scoped. Unrelated cleanups belong in their own PR.
- Add or update tests for behavior changes. Tests live in `tests/commands/`
  and `tests/utils/`, mirroring `src/`.
- Update the README when you add, remove, or rename a command or flag.
- Paste the output of the three quality gates into the PR description.

Commands are wired up in `src/index.ts` and implemented in `src/commands/`.
Shared helpers, including the `op` wrapper, live in `src/utils/`.

## Security

Do not open a public issue for a vulnerability. See [`SECURITY.md`](SECURITY.md)
for how to report one, and for the handling rules any change touching secret
values is expected to preserve.
