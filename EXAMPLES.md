# ops CLI Examples

## Basic Usage

### Get a secret (interactive)
```bash
ops get OPENAI_API_KEY
# If not found, prompts:
# ? Would you like to create this secret now? (Y/n)
# ? Enter secret value: ********
# ✓ Secret stored successfully!
```

### Get a secret (silent mode for scripting)
```bash
# Returns just the value, no UI
TOKEN=$(ops get GITHUB_TOKEN --silent)
echo $TOKEN
```

## Real-World Scenarios

### Scenario 1: Setting up a new project

```bash
# Clone repo
git clone https://github.com/user/project.git
cd project

# Generate .env from 1Password
ops export --vault Development --output .env

# Install and run
npm install
npm run dev
```

### Scenario 2: CI/CD Pipeline

```bash
#!/bin/bash
# deploy.sh

set -e

# Get deployment credentials
export AWS_ACCESS_KEY_ID=$(ops get AWS_ACCESS_KEY --vault Production --silent)
export AWS_SECRET_ACCESS_KEY=$(ops get AWS_SECRET_KEY --vault Production --silent)

# Deploy
npm run build
aws s3 sync dist/ s3://my-bucket/
```

### Scenario 3: Multiple environments

```bash
# Development
ops export --vault Development --output .env.dev

# Staging
ops export --vault Staging --output .env.staging

# Production
ops export --vault Production --output .env.prod

# Load the right one
source .env.dev
```

### Scenario 4: Onboarding new developer

```bash
# New developer joins team
# They just need to:

# 1. Get access to the 1Password vault
# 2. Run one command
ops export --vault TeamProject --output .env

# Done! All secrets loaded
```

### Scenario 5: Secure script with automatic prompts

```bash
#!/bin/bash
# api-test.sh

set -e

# If API key doesn't exist, user will be prompted to create it
API_KEY=$(ops get TEST_API_KEY --silent)

# Test the API
curl -H "Authorization: Bearer $API_KEY" \
     https://api.example.com/v1/status
```

## Advanced Usage

### View favorites
```bash
# List only your favorite secrets
ops favorites

# Or use the flag
ops list --favorites

# Output:
# Favorites in vault "Private":
#
# TITLE                    CATEGORY        ID
# ──────────────────────────────────────────────────
# ⭐ OPENAI_API_KEY         password        abc123
# ⭐ GITHUB_TOKEN           password        def456
# ⭐ AWS_ACCESS_KEY         password        ghi789

# Favorites also show with ⭐ in regular list
ops list
```

### Resolve a 1Password share link
```bash
# Turn a share link into op:// and ops get commands
ops resolve "https://share.1password.com/s#..."
```

### Search for secrets
```bash
# Find all GitHub-related secrets
ops list --search github

# Output:
# Items in vault "Private":
#
# TITLE              CATEGORY        ID
# ──────────────────────────────────────────────
# GitHub-Token       password        abc123
# GitHub-Deploy-Key  password        def456
```

### Export as JSON for processing
```bash
# Export and process with jq
ops export --format json | jq -r 'to_entries[] | "\(.key)=\(.value)"'

# Export to file
ops export --format json --output secrets.json
```

### Import from .env
```bash
# Import secrets from a local env file
ops import .env

# Import into a specific vault
ops import .env --vault Work
```

### Batch create secrets
```bash
# Create multiple secrets
while IFS='=' read -r key value; do
  ops set "$key" --value "$value"
done < secrets.txt
```

### Update existing secret
```bash
# Will prompt for confirmation before overwriting
ops set OPENAI_API_KEY

# Output:
# ? Secret "OPENAI_API_KEY" already exists. Overwrite it? (y/N)
```

## Integration Patterns

### Docker Compose
```bash
# docker-compose.yml
services:
  app:
    image: myapp
    env_file: .env

# Generate .env
ops export --output .env
docker-compose up
```

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
- name: Get secrets
  run: |
    eval $(ops export | sed 's/^/export /')
    echo "::add-mask::$OPENAI_API_KEY"
```

### Make commands
```makefile
# Makefile
.PHONY: env
env:
	ops export --output .env

.PHONY: deploy
deploy: env
	npm run build
	npm run deploy
```

## Error Handling

### Not signed in
```bash
ops get TOKEN
# Error: Not signed in to 1Password. Run: op signin
```

### Vault not found
```bash
ops list --vault NonExistent
# Error: Vault "NonExistent" not found
```

### CLI not installed
```bash
ops get TOKEN
# Error: op CLI not found. Install from: https://1password.com/downloads/command-line/
```

## Tips & Best Practices

1. **Use silent mode in scripts**
   ```bash
   # Good
   TOKEN=$(ops get TOKEN --silent)

   # Avoid (includes UI in output)
   TOKEN=$(ops get TOKEN)
   ```

2. **Always specify vault in production**
   ```bash
   # Good
   ops get TOKEN --vault Production

   # Risky (uses default "Private")
   ops get TOKEN
   ```

3. **Use .env files for local dev**
   ```bash
   # Generate once
   ops export --output .env

   # Add to .gitignore
   echo ".env" >> .gitignore
   ```

4. **Never commit secrets**
   ```bash
   # Bad
   export OPENAI_API_KEY="sk-xxxxx"  # In shell history!

   # Good
   export OPENAI_API_KEY=$(ops get OPENAI_API_KEY --silent)
   ```

5. **Use search before creating duplicates**
   ```bash
   # Check what exists first
   ops list --search "openai"

   # Then create with unique name
   ops set OPENAI_API_KEY_V2
   ```
