# Vaultkeep

Fetch, inject, and export 1Password secrets from the command line.

[![CI](https://github.com/dallascrilley/vaultkeep/actions/workflows/ci.yml/badge.svg)](https://github.com/dallascrilley/vaultkeep/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

I wrote Vaultkeep because I kept doing two things I could not defend: pasting
secrets into `.env` files by hand, and memorizing `op://` references so I would
not have to. Vaultkeep wraps the
[1Password CLI](https://1password.com/downloads/command-line/) so a secret can
be read, injected into a running process, or written out to a file in one
command, without ever landing somewhere I might commit it.

**On the names.** The project is Vaultkeep. It is published on npm as
`dc-ops-cli`, and the installed binary is `ops`. Both names predate the rebrand
and are staying, so existing installs and scripts keep working.

## In 30 seconds

```bash
git clone https://github.com/dallascrilley/vaultkeep.git
cd vaultkeep && npm install && npm run build && npm link

ops get GITHUB_TOKEN                   # read one secret
ops run -- npm start                   # inject a .env.ops mapping into a process
ops export --vault Work --output .env  # write a real .env when a tool demands one
```

Jump to [Installation](#installation), the
[commands reference](#commands-reference), the
[technical docs](docs/README.md), or the [license](LICENSE).

## Features

- 🔐 **Smart retrieval** - Get secrets with automatic fallback prompts
- 🧠 **Smart field detection** - Auto-detects the right field based on item type (API keys use `credential`, logins use `password`)
- 📝 **Interactive prompts** - Create secrets on-the-fly if not found
- 🧭 **Interactive mode** - Fuzzy browse vaults and items
- 🧩 **Templates** - Create common secret sets in one command
- 📋 **List & search** - Browse your vault items
- ⭐ **Favorites** - Quick access to your most-used secrets
- 📤 **Export** - Generate .env files from your vault
- ⚙️ **Config file** - Defaults via `.opsrc` (vault, field, envFile, parallel)
- 🔁 **Session caching** - Cache OP_SESSION tokens to reduce prompts
- ✅ **Validated env mappings** - Schema checks for `.env.ops` / `.env.ops.json`
- 🔍 **Inspect** - Discover available fields for any secret
- 🏦 **Vaults** - List and browse available vaults
- 💡 **Smart suggestions** - Get hints when secrets or fields aren't found
- 🎨 **Readable output** - Colored output and progress indicators
- 🔒 **Quiet by default** - Secret values go to stdout only when you ask for them
- ⌨️ **Shell completion** - Tab completion for bash, zsh, and fish

## Requirements

- **Node.js 22 or newer.** This is declared in `package.json` (`engines.node:
  ">=22.0.0"`), so `npm install -g dc-ops-cli` warns on older Node and fails
  outright under `npm config set engine-strict true`. Node 22 is also the only
  version CI builds and tests against. Check yours with `node --version`.
- **The 1Password CLI (`op`)**, installed and signed in. See
  [Prerequisites](#prerequisites).
- macOS, Linux, or Windows.

## Installation

**From source** (recommended until `dc-ops-cli@1.14.3` or newer is on npm):

```bash
git clone https://github.com/dallascrilley/vaultkeep.git
cd vaultkeep
npm install && npm run build && npm link
```

**From npm** (package name `dc-ops-cli`, binary `ops`):

```bash
npm install -g dc-ops-cli
```

npm still serves **1.14.2** (January 2026). That build predates the Vaultkeep
rebrand and the security fixes in this tree: secret values on `op` argv, world-readable
export files, and a clipboard clear race on `ops copy`. Prefer the source install
above until `npm view dc-ops-cli version` reports **1.14.3** or higher. The
installed name stays `dc-ops-cli` / `ops` so existing scripts keep working.

## Update

```bash
git pull && npm install && npm run build   # source install
# or, once 1.14.3+ is on npm:
npm install -g dc-ops-cli@latest
```

## Prerequisites

1. Node.js 22 or newer (`node --version`) - see [Requirements](#requirements)
2. Install [1Password CLI](https://1password.com/downloads/command-line/)
3. Sign in: `op signin`

### Service Account (Headless/CI)

For automated environments without Touch ID, use a service account token:

```bash
# Create directory and save token
mkdir -p ~/.config/op
echo "ops_YOUR_SERVICE_ACCOUNT_TOKEN" > ~/.config/op/sa_token
chmod 600 ~/.config/op/sa_token
```

ops automatically loads the token from `~/.config/op/sa_token` for all commands. Get a service account token from [1Password Settings → Developer → Service Accounts](https://my.1password.com).

## Usage

### Get a secret

```bash
# Get a secret (auto-detects field based on item type)
ops get GITHUB_TOKEN

# Smart field detection:
# - API_CREDENTIAL items → uses 'credential' field
# - LOGIN items → uses 'password' field
# - SECURE_NOTE items → uses 'notesPlain' field

# Specify vault and field explicitly
ops get GITHUB_TOKEN --vault Personal --field api-key

# Works with special characters in item names
ops get "NPM_TOKEN - dallasdotjs / gh_actions_publish"

# Plain output (for piping)
export TOKEN=$(ops get GITHUB_TOKEN --plain)

# JSON output
ops get GITHUB_TOKEN --json

# Fallback value if secret not found
ops get GITHUB_TOKEN=default_value
```

### Store a secret

```bash
# Interactive prompt for value
ops set GITHUB_TOKEN

# Pass value directly
ops set GITHUB_TOKEN --value "ghp_xxxxxxxxxxxx"

# Inline KEY=VALUE format (quick one-liner)
ops set GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Read value from file or stdin
ops set GITHUB_TOKEN --value-file ~/.secrets/github_token
cat token.txt | ops set GITHUB_TOKEN --value -

# Specify vault
ops set GITHUB_TOKEN --vault Work

# Force overwrite without confirmation (-y is alias for --force)
ops set GITHUB_TOKEN --value "new_value" -y
```

Values are handed to `op` on stdin as an item JSON template, never as command
arguments, so they are not visible to other processes and do not appear in
error output. One consequence: a **new** item created for a non-default field
(`--field api_key`) is an API Credential rather than a Password item, because
`op` rejects a Password template with an empty password. Either way the value
stays readable at `op://<vault>/<item>/<field>`. Items created for the default
`password` field are unchanged.

### Get multiple secrets

```bash
# Get multiple secrets at once
ops get-many API_KEY DB_PASSWORD REDIS_URL

# Shorthand alias
ops gets API_KEY DB_PASSWORD

# Read secret names from stdin (one per line)
echo -e "API_KEY\nDB_PASSWORD" | ops gets -

# Or from a file
ops gets - < secrets.txt

# Output as JSON
ops gets API_KEY DB_PASSWORD --json
```

### Copy a secret to the clipboard

```bash
# Copy and clear after 30s
ops copy GITHUB_TOKEN

# Custom TTL
ops copy GITHUB_TOKEN --ttl 10
```

`ops copy` stays in the foreground until the TTL expires so it can clear the
clipboard and confirm it. Press `Ctrl-C` to clear immediately. For scripts that
cannot wait, `--ttl 0` copies and returns straight away without ever clearing,
or run it in the background (`ops copy GITHUB_TOKEN &`). The clear is skipped if
you have copied something else in the meantime.

### List secrets

```bash
# List all items in default vault
ops list

# List from specific vault
ops list --vault Work

# Search items
ops list --search "github"

# Dedicated search command
ops search "github"

# JSON output
ops list --json

# Plain output (tab-delimited)
ops list --plain
```

### View favorites

```bash
# List only favorite items (⭐ markers in regular list)
ops favorites

# Or use the flag
ops list --favorites

# Favorites also show in regular list with ⭐ markers
ops list

# Mark items as favorites in 1Password app or web interface
```

### Export secrets

```bash
# Export as .env to stdout
ops export

# Export to file
ops export --output .env

# Export as JSON
ops export --format json --output secrets.json

# JSON to stdout
ops export --json

# From specific vault
ops export --vault Work --output work.env

# Filter by glob pattern
ops export --filter "API_*"
ops export --filter "*_TOKEN" --output tokens.env
```

A file written with `--output` holds plaintext secrets, so `ops export` creates
it with mode `0600` (owner read/write only) and narrows an existing file to
`0600` as well. It is still a plaintext secrets file: keep it out of version
control and delete it when you are done. Prefer `ops run` when a process only
needs the values in its environment.

### Import secrets

```bash
# Import from a .env file (KEY=VALUE per line)
ops import .env

# Import into a specific vault
ops import .env --vault Work

# Preview what would be imported without making changes
ops import .env --dry-run

# Import from stdin
cat .env | ops import -
echo "NEW_SECRET=value" | ops import
```

### Run a command with injected secrets

Create a `.env.ops` file that maps environment variables to secret names:

```
API_KEY=MY_API_KEY_SECRET
DB_PASSWORD=MY_DB_PASSWORD
```

Then run:

```bash
ops run -- node app.js

# Resolve secrets in parallel (default: 5)
ops run --parallel 10 -- node app.js

# Or inline mappings
ops run --env API_KEY=MY_API_KEY_SECRET -- node app.js

# Verbose mode shows which secrets are injected
ops run --verbose --env API_KEY=MY_API_KEY_SECRET -- node app.js
```

You can also use JSON mapping files with schema validation:

```json
{
  "API_KEY": "MY_API_KEY_SECRET",
  "DB_PASSWORD": "MY_DB_PASSWORD"
}
```

Save as `.env.ops.json` and run `ops run -- node app.js` to load it.

### Templates

Create common secret sets from a template:

```bash
# List templates
ops template list

# Apply a built-in template
ops template apply postgres --vault Work

# Provide values inline
ops template apply api --value API_KEY=secret --value API_URL=https://api.example.com

# Create a custom template
ops template create my-service --fields "API_KEY,API_SECRET,WEBHOOK_URL"
```

### Interactive mode

Browse vaults and items with a fuzzy finder:

```bash
ops interactive
# or
ops i
```

Choose an item, then copy/get/inspect it from the action menu.

### Config file (.opsrc)

Set defaults in `~/.opsrc` or `.opsrc` in your project (JSON or YAML):

```yaml
vault: Work
field: password
envFile: .env.ops
parallel: 8
sessionCache:
  enabled: true
  path: ~/.config/ops-cli/session.json
```

Use a custom path with `OPS_CONFIG=/path/to/.opsrc`.

### Session caching

By default ops stores OP_SESSION tokens in `~/.config/ops-cli/session.json`.
Disable with `OPS_NO_SESSION_CACHE=1` or `OPS_SESSION_CACHE=0`.

### Resolve a share link

```bash
# Resolve a 1Password share link to an op:// reference
ops resolve "https://share.1password.com/s#..."

# JSON output for scripting
ops resolve "https://share.1password.com/s#..." --json
```

Outputs all available fields (id/label/type) so you can pick the right `--field`.

### Inspect a secret

```bash
# List available fields for a secret
ops inspect "GitHub PAT"

# JSON output
ops inspect "GitHub PAT" --json
```

Useful for discovering field names before using `ops get --field`.

### List vaults

```bash
# List all available vaults
ops vaults

# JSON output
ops vaults --json
```

### Check session status

```bash
# Show current 1Password account and session info
ops whoami

# JSON output for scripting
ops whoami --json
```

Shows your signed-in email, account URL, default vault/field settings, and accessible vaults.

### Shell Completion

Generate shell completion scripts for bash, zsh, or fish:

```bash
# Bash - add to ~/.bashrc
source <(ops completion bash)

# Or append permanently
ops completion bash >> ~/.bashrc

# Zsh - add to ~/.zshrc
source <(ops completion zsh)

# Or save to completions directory
ops completion zsh > ~/.zsh/completions/_ops

# Fish - save to completions directory
ops completion fish > ~/.config/fish/completions/ops.fish
```

Features:
- Tab completion for all commands and options
- Dynamic vault name completion (from 1Password)
- Dynamic item name completion (from 1Password)
- Field name suggestions

### Smart suggestions & fuzzy matching

When a secret or field isn't found, ops provides helpful suggestions and interactive fuzzy matching:

```bash
# If field doesn't exist, suggests available fields
$ ops get "GitHub PAT" --field token
Error: Field "token" not found
Available fields: password, username, otp
Try: ops get "GitHub PAT" --field password

# If secret doesn't exist, fuzzy matching finds similar names
$ ops get "GutHub PAT"
Secret "GutHub PAT" not found in vault "Private"
? Did you mean one of these?
❯ GitHub PAT (85% match)
  GitLab PAT (72% match)
  None of these - create new secret
  Cancel

# Select a match to retrieve that secret instead
```

The fuzzy matching uses Levenshtein distance combined with substring and word overlap heuristics for accurate suggestions.

The clipboard `copy` command also confirms when it clears the clipboard after the TTL expires.

## Contributing

We use [Conventional Commits](https://www.conventionalcommits.org/) with [semantic-release](https://semantic-release.gitbook.io/) for automated versioning.

### Commit Convention

| Type | Release | Example |
|------|---------|---------|
| `fix:` | Patch (1.0.x) | `fix: handle empty secrets correctly` |
| `feat:` | Minor (1.x.0) | `feat: add vault search command` |
| `feat!:` | Major (x.0.0) | `feat!: redesign API` |
| `docs:` | None | `docs: update README` |
| `chore:` | None | `chore: update dependencies` |
| `refactor:` | None | `refactor: simplify error handling` |
| `test:` | None | `test: add get command tests` |

### Release Process

**Fully automated** - just follow these steps:

```bash
# 1. Run quality gates (required before pushing)
npm run typecheck && npm run build && npm test

# 2. Commit with conventional format
git add .
git commit -m "feat: your new feature"

# 3. Push to master - CI handles everything
git push origin master
```

**What happens automatically:**
1. CI runs typecheck, build, and tests
2. semantic-release analyzes your commits
3. Version is bumped in package.json
4. CHANGELOG.md is updated
5. GitHub release is created
6. Package is published to npm

**Do NOT manually:**
- Edit version in package.json
- Edit CHANGELOG.md
- Create GitHub releases
- Publish to npm

### Quality Gates

All must pass before pushing:

```bash
npm run typecheck    # TypeScript type checking
npm run build        # Compile to dist/
npm test             # Run all tests
```

## Agent and script integration

The pattern I use in agent instructions and setup scripts:

```bash
# 1. Check 1Password first
ops get OPENAI_API_KEY --silent 2>/dev/null || echo "not_found"

# 2. If not found, prompt and store
ops set OPENAI_API_KEY

# 3. Never leave raw tokens in files
# Always use: ops get SERVICE_KEY --silent
```

## Common Patterns

### Development Environment Setup

```bash
# Generate .env from 1Password
ops export --vault Development --output .env

# Source it
source .env
```

### CI/CD Integration

```bash
# Get secret for GitHub Actions
export TOKEN=$(ops get DEPLOY_TOKEN --silent)

# Or export all secrets
ops export --format json | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' >> $GITHUB_ENV
```

### Shell Script Integration

```bash
#!/bin/bash
set -e

# Get API key with automatic prompt if missing
API_KEY=$(ops get MY_SERVICE_API_KEY --silent)

# Use in curl
curl -H "Authorization: Bearer $API_KEY" https://api.example.com
```

## Commands Reference

This table mirrors `ops --help` and each subcommand's `--help` for the current
version. If it ever disagrees with the CLI, the CLI is right - please open an
issue.

### Global options

Accepted before the subcommand (`ops --retry 5 get TOKEN`):

| Option | Description |
|--------|-------------|
| `-V, --version` | Print the version |
| `-h, --help` | Show help for `ops` or for any subcommand |
| `--retry <count>` | Max retry attempts for transient failures (default `3`, env `OPS_RETRY_COUNT`) |
| `--no-retry` | Disable retry logic entirely (env `OPS_NO_RETRY=1`) |

Two options recur on nearly every subcommand and are listed per command below:

- `-q, --quiet` - suppress non-essential output (spinners, summaries). Also
  `OPS_QUIET=1`. Not available on `run`, `interactive`, or `update`.
- `--no-color` - disable ANSI color. Also `OPS_NO_COLOR=1` or the standard
  `NO_COLOR`. Not available on `update`.

### Commands

| Command | Description | Options |
|---------|-------------|---------|
| `get <name>` | Get a secret (supports `KEY=fallback`) | `-v, --vault`, `-f, --field`, `-s, --silent`, `--plain`, `--json`, `--no-input`, `-q, --quiet`, `--no-color` |
| `get-many <names...>` | Get multiple secrets (alias: `gets`; `-` reads names from stdin) | `-v, --vault`, `-f, --field`, `-j, --json`, `-e, --env`, `--plain`, `--parallel <count>`, `--continue-on-error`, `-q, --quiet`, `--no-color` |
| `inspect <name>` | Show available fields for an item | `-v, --vault`, `-j, --json`, `-q, --quiet`, `--no-color` |
| `set <name>` | Store a secret (supports `KEY=VALUE`) | `-v, --vault`, `-f, --field`, `--value <value>`, `--value-file <file>`, `-y, --force`, `--no-input`, `-q, --quiet`, `--no-color` |
| `run <command...>` | Run a command with secrets injected into its environment | `-v, --vault`, `-f, --field`, `-e, --env <pair>`, `--env-file <file>`, `--parallel <count>`, `--verbose`, `--no-color` |
| `copy <name>` | Copy a secret to the clipboard and clear it after a delay | `-v, --vault`, `-f, --field`, `--ttl <seconds>`, `-q, --quiet`, `--no-color` |
| `list` | List all items in a vault | `-v, --vault`, `-s, --search <query>`, `-j, --json`, `--plain`, `--favorites`, `-q, --quiet`, `--no-color` |
| `search <query>` | Search items by title in a vault | `-v, --vault`, `-j, --json`, `--plain`, `-q, --quiet`, `--no-color` |
| `favorites` | List favorite items in a vault | `-v, --vault`, `-j, --json`, `--plain`, `-q, --quiet`, `--no-color` |
| `vaults` | List available vaults | `-j, --json`, `-q, --quiet`, `--no-color` |
| `export` | Export secrets as .env or JSON | `-v, --vault`, `-f, --format <env\|json>`, `-j, --json`, `-o, --output <file>`, `--filter <pattern>`, `-q, --quiet`, `--no-color` |
| `import [file]` | Import secrets from a .env file (`-` for stdin) | `-v, --vault`, `--dry-run`, `-q, --quiet`, `--no-color` |
| `resolve <shareLink>` | Resolve a 1Password share link to ops references | `-j, --json`, `-q, --quiet`, `--no-color` |
| `interactive` | Browse vaults and items interactively (alias: `i`) | `-v, --vault`, `-f, --field`, `--no-color` |
| `whoami` | Show current 1Password account and vault info | `-j, --json`, `-q, --quiet`, `--no-color` |
| `completion [shell]` | Generate a completion script (`bash`, `zsh`, `fish`) | `-q, --quiet`, `--no-color` |
| `update` | Update ops to the latest version | `-c, --check`, `--force` |
| `template list` | List available templates | `-j, --json`, `-q, --quiet`, `--no-color` |
| `template apply <name>` | Apply a template and create its secrets | `-v, --vault`, `-f, --field`, `--value <pair>`, `--no-input`, `-q, --quiet`, `--no-color` |
| `template create <name>` | Create a custom template | `--fields <fields>`, `--description <description>`, `-y, --force`, `-q, --quiet`, `--no-color` |

### `op` passthrough

Anything `ops` does not recognize is forwarded to the 1Password CLI, so you do
not have to switch binaries mid-script:

```bash
ops op vault list        # explicit passthrough
ops item list --vault Work   # unknown command, forwarded to `op`
```

### Environment variables

| Variable | Effect |
|----------|--------|
| `OPS_VAULT` | Default vault (otherwise `Private`) |
| `OPS_FIELD` | Default field (otherwise `password`) |
| `OPS_QUIET` | Same as `-q, --quiet` |
| `OPS_NO_COLOR` / `NO_COLOR` | Same as `--no-color` |
| `OPS_RETRY_COUNT` | Same as `--retry <count>` |
| `OPS_NO_RETRY` | Same as `--no-retry` |
| `OPS_CONFIG` | Path to an alternate `.opsrc` |
| `OPS_NO_SESSION_CACHE` / `OPS_SESSION_CACHE=0` | Disable the session token cache |

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev -- get GITHUB_TOKEN

# Type check
npm run typecheck

# Build
npm run build
```

## More documentation

- [docs/README.md](docs/README.md) - architecture, code structure, testing strategy
- [QUICKSTART.md](QUICKSTART.md) - five minute walkthrough
- [EXAMPLES.md](EXAMPLES.md) - longer worked examples
- [CHANGELOG.md](CHANGELOG.md) - release history
- [docs/TESTING_REPORT.md](docs/TESTING_REPORT.md) and [docs/FRICTION_REPORT.md](docs/FRICTION_REPORT.md) - the manual test pass and friction log that drove several releases

## License

[MIT](LICENSE). Copyright (c) 2026 Dallas Crilley.
