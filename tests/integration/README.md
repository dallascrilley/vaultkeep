# Integration Tests

Integration tests for ops-cli that run against a real 1Password vault.

## Prerequisites

1. **Install 1Password CLI**
   ```bash
   # macOS
   brew install --cask 1password-cli

   # Linux
   # See: https://1password.com/downloads/command-line/
   ```

2. **Sign in to 1Password**
   ```bash
   op signin
   # Or for service accounts:
   export OP_SERVICE_ACCOUNT_TOKEN="..."
   ```

3. **Create a test vault**
   ```bash
   op vault create "ops-cli-test"
   ```

4. **Verify setup**
   ```bash
   op vault list  # Should show ops-cli-test
   ```

## Running Integration Tests

### Locally

```bash
# Run integration tests (requires TEST_OP_CLI=1)
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Run unit tests only (default, no 1Password required)
npm test
```

### Test Items

The integration tests automatically create these test items:
- `Test Login Item` - LOGIN category with username/password
- `Test API Credential` - API_CREDENTIAL category with credential field
- `Test Secure Note` - SECURE_NOTE category with notesPlain

### Cleanup

By default, test items are NOT deleted after tests run.

To clean up after tests:
```bash
CLEANUP_TEST_VAULT=1 npm run test:integration
```

Or manually:
```bash
op item delete "Test Login Item" --vault ops-cli-test
op item delete "Test API Credential" --vault ops-cli-test
op item delete "Test Secure Note" --vault ops-cli-test
```

## CI/CD Integration

Integration tests are NOT run in CI by default to avoid exposing secrets.

For secure CI environments with service account tokens:

```yaml
# Example GitHub Actions workflow
integration-tests:
  runs-on: ubuntu-latest
  environment: integration  # Protected environment with secrets
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run build
    - run: npm run test:integration
      env:
        OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
        TEST_OP_CLI: "1"
```

## Troubleshooting

### "op: command not found"
Install 1Password CLI: https://1password.com/downloads/command-line/

### "You are not signed in"
Run `op signin` or set `OP_SERVICE_ACCOUNT_TOKEN`

### "vault not found"
Create the test vault: `op vault create "ops-cli-test"`

### Tests create duplicate items
Delete existing items first:
```bash
op item delete "Test Login Item" --vault ops-cli-test 2>/dev/null
op item delete "Test API Credential" --vault ops-cli-test 2>/dev/null
op item delete "Test Secure Note" --vault ops-cli-test 2>/dev/null
```

## Test Coverage

The integration tests verify:
- ✅ CLI help and version output
- ✅ Vault listing
- ✅ Item listing and searching
- ✅ Secret retrieval (get command)
- ✅ Smart field detection (LOGIN, API_CREDENTIAL, SECURE_NOTE)
- ✅ Item inspection
- ✅ Shell completion generation
- ✅ Export functionality
- ✅ Error handling for missing items
