# ops - 1Password CLI Helper

Easy secret retrieval from 1Password with smart fallbacks and interactive prompts.

## Features

- 🔐 **Smart retrieval** - Get secrets with automatic fallback prompts
- 📝 **Interactive prompts** - Create secrets on-the-fly if not found
- 📋 **List & search** - Browse your vault items
- ⭐ **Favorites** - Quick access to your most-used secrets
- 📤 **Export** - Generate .env files from your vault
- 🎨 **Beautiful UI** - Colored output and progress indicators
- 🔒 **Secure** - Never exposes secrets in logs or chat

## Installation

```bash
# Install dependencies
cd op-cli-helper
npm install

# Build
npm run build

# Link globally for development
npm link
```

## Prerequisites

1. Install [1Password CLI](https://1password.com/downloads/command-line/)
2. Sign in: `op signin`

## Usage

### Get a secret

```bash
# Get a secret (prompts to create if not found)
ops get GITHUB_TOKEN

# Specify vault and field
ops get GITHUB_TOKEN --vault Personal --field api-key

# Silent mode (for piping)
export TOKEN=$(ops get GITHUB_TOKEN --silent)
```

### Store a secret

```bash
# Interactive prompt for value
ops set GITHUB_TOKEN

# Pass value directly
ops set GITHUB_TOKEN --value "ghp_xxxxxxxxxxxx"

# Specify vault
ops set GITHUB_TOKEN --vault Work
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

# From specific vault
ops export --vault Work --output work.env
```

### Import secrets

```bash
# Import from a .env file (KEY=VALUE per line)
ops import .env

# Import into a specific vault
ops import .env --vault Work
```

### Resolve a share link

```bash
# Resolve a 1Password share link to an op:// reference
ops resolve "https://share.1password.com/s#..."

# JSON output for scripting
ops resolve "https://share.1password.com/s#..." --json
```

Outputs all available fields (id/label/type) so you can pick the right `--field`.

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
| `get <name>` | Get a secret | `-v, --vault`, `-f, --field`, `-s, --silent` |
| `set <name>` | Store a secret | `-v, --vault`, `-f, --field`, `--value` |
| `list` | List vault items | `-v, --vault`, `-s, --search`, `-j, --json`, `--favorites` |
| `search <query>` | Search items by title | `-v, --vault`, `-j, --json` |
| `favorites` | List favorite items | `-v, --vault`, `-j, --json` |
| `export` | Export to .env/JSON | `-v, --vault`, `-f, --format`, `-o, --output` |
| `import <file>` | Import secrets from .env | `-v, --vault` |
| `resolve <shareLink>` | Resolve share link to ops reference | `-j, --json` |

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
