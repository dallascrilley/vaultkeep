# Quick Start Guide

## Installation

```bash
cd op-cli-helper
npm install
npm run build
npm link  # Install globally
```

## First Use

### 1. Ensure you're signed in to 1Password
```bash
op signin
```

### 2. Get a secret (with auto-prompt if not found)
```bash
ops get GITHUB_TOKEN
```

If the secret doesn't exist, you'll see:
```
⠹ Fetching secret from 1Password...
✖ Secret "GITHUB_TOKEN" not found in vault "Private"
? Would you like to create this secret now? (Y/n) y
? Enter secret value: ********
⠹ Storing secret in 1Password...
✓ Secret stored successfully!

You can retrieve it anytime with:
  ops get GITHUB_TOKEN
```

### 3. Retrieve it again (instantly)
```bash
ops get GITHUB_TOKEN
```

Output:
```
⠹ Fetching secret from 1Password...
✓ Secret retrieved!

Secret value:
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Use in scripts (silent mode)
```bash
export TOKEN=$(ops get GITHUB_TOKEN --silent)
echo $TOKEN  # Just the value, no UI
```

### 5. Resolve a share link
```bash
ops resolve "https://share.1password.com/s#..."
```

## Common Workflows

### Setup a new project
```bash
# Clone repo
git clone https://github.com/user/project.git
cd project

# Generate .env from 1Password
ops export --output .env

# Start development
npm install
npm run dev
```

### Store multiple secrets
```bash
ops set OPENAI_API_KEY
ops set ANTHROPIC_API_KEY
ops set GITHUB_TOKEN
```

### Browse your secrets
```bash
# List all
ops list

# Search
ops list --search "api"

# From specific vault
ops list --vault Work
```

### Export for different environments
```bash
# Development
ops export --vault Development --output .env.dev

# Production
ops export --vault Production --output .env.prod
```

## Integration with AGENTS.md Pattern

This tool implements the pattern from §13 of AGENTS.md:

```bash
# When an agent needs a secret, it should:

# 1. Check 1Password first (never ask user directly)
API_KEY=$(ops get OPENAI_API_KEY --silent 2>/dev/null)

# 2. If not found, the tool prompts automatically
if [ -z "$API_KEY" ]; then
  # ops get will prompt the user to create it
  API_KEY=$(ops get OPENAI_API_KEY --silent)
fi

# 3. Use the secret
curl -H "Authorization: Bearer $API_KEY" https://api.openai.com/v1/models
```

## Next Steps

- See [README.md](./README.md) for full documentation
- See [EXAMPLES.md](./EXAMPLES.md) for real-world usage patterns
- Run `ops --help` for command reference
