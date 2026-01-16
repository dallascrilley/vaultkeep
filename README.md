# ops - 1Password CLI Helper

[![npm version](https://img.shields.io/npm/v/dc-ops-cli.svg)](https://www.npmjs.com/package/dc-ops-cli)

Easy secret retrieval from 1Password with smart fallbacks and interactive prompts.

## Features

- 🔐 **Smart retrieval** - Get secrets with automatic fallback prompts
- 🧠 **Smart field detection** - Auto-detects the right field based on item type (API keys use `credential`, logins use `password`)
- 📝 **Interactive prompts** - Create secrets on-the-fly if not found
- 📋 **List & search** - Browse your vault items
- ⭐ **Favorites** - Quick access to your most-used secrets
- 📤 **Export** - Generate .env files from your vault
- 🔍 **Inspect** - Discover available fields for any secret
- 🏦 **Vaults** - List and browse available vaults
- 💡 **Smart suggestions** - Get hints when secrets or fields aren't found
- 🎨 **Beautiful UI** - Colored output and progress indicators
- 🔒 **Secure** - Never exposes secrets in logs or chat

## Installation

```bash
# Install from npm
npm install -g dc-ops-cli

# Or install from source
git clone https://github.com/dallascrilley/op-cli-helper.git
cd op-cli-helper
npm install && npm run build && npm link
```

## Prerequisites

1. Install [1Password CLI](https://1password.com/downloads/command-line/)
2. Sign in: `op signin`

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
```

### Store a secret

```bash
# Interactive prompt for value
ops set GITHUB_TOKEN

# Pass value directly
ops set GITHUB_TOKEN --value "ghp_xxxxxxxxxxxx"

# Read value from file or stdin
ops set GITHUB_TOKEN --value-file ~/.secrets/github_token
cat token.txt | ops set GITHUB_TOKEN --value -

# Specify vault
ops set GITHUB_TOKEN --vault Work
```

### Copy a secret to the clipboard

```bash
# Copy and clear after 30s
ops copy GITHUB_TOKEN

# Custom TTL
ops copy GITHUB_TOKEN --ttl 10
```

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
```

### Import secrets

```bash
# Import from a .env file (KEY=VALUE per line)
ops import .env

# Import into a specific vault
ops import .env --vault Work

# Preview what would be imported without making changes
ops import .env --dry-run
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

# Or inline mappings
ops run --env API_KEY=MY_API_KEY_SECRET -- node app.js

# Verbose mode shows which secrets are injected
ops run --verbose --env API_KEY=MY_API_KEY_SECRET -- node app.js
```

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

### Smart suggestions

When a secret or field isn't found, ops provides helpful suggestions:

```bash
# If field doesn't exist, suggests available fields
$ ops get "GitHub PAT" --field token
Error: Field "token" not found
Available fields: password, username, otp
Try: ops get "GitHub PAT" --field password

# If secret doesn't exist, suggests similar names
$ ops get "GutHub PAT"
Error: Secret "GutHub PAT" not found
Did you mean: GitHub PAT, GitLab PAT
```

The clipboard `copy` command also confirms when it clears the clipboard after the TTL expires.

## Contributing

We use [Conventional Commits](https://www.conventionalcommits.org/) with [semantic-release](https://semantic-release.gitbook.io/) for automated versioning:

```bash
# Bug fixes → patch release (1.0.1)
git commit -m "fix: handle empty secrets correctly"

# New features → minor release (1.1.0)
git commit -m "feat: add vault search command"

# Breaking changes → major release (2.0.0)
git commit -m "feat!: redesign API"
# or
git commit -m "feat: new feature

BREAKING CHANGE: description of breaking change"
```

Just push to `master` - releases happen automatically!

## Integration with AGENTS.md Pattern

This tool follows the pattern in §13 of AGENTS.md:

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

| Command | Description | Options |
|---------|-------------|---------|
| `get <name>` | Get a secret | `-v, --vault`, `-f, --field`, `--plain`, `--json`, `-s, --silent`, `--no-input` |
| `set <name>` | Store a secret | `-v, --vault`, `-f, --field`, `--value`, `--value-file`, `--force`, `--no-input` |
| `copy <name>` | Copy a secret to clipboard | `-v, --vault`, `-f, --field`, `--ttl`, `-q, --quiet` |
| `list` | List vault items | `-v, --vault`, `-s, --search`, `-j, --json`, `--plain`, `--favorites` |
| `search <query>` | Search items by title | `-v, --vault`, `-j, --json`, `--plain` |
| `favorites` | List favorite items | `-v, --vault`, `-j, --json`, `--plain` |
| `export` | Export to .env/JSON | `-v, --vault`, `-f, --format`, `-j, --json`, `-o, --output` |
| `import <file>` | Import secrets from .env | `-v, --vault`, `--dry-run` |
| `run` | Run a command with secrets injected | `-v, --vault`, `-f, --field`, `-e, --env`, `--env-file`, `--verbose` |
| `resolve <shareLink>` | Resolve share link to ops reference | `-j, --json` |
| `inspect <name>` | Show available fields for a secret | `-v, --vault`, `-j, --json` |
| `vaults` | List available vaults | `-j, --json` |

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

## License

MIT