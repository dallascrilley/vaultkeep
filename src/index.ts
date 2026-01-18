#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { getCommand } from './commands/get.js';
import { listCommand } from './commands/list.js';
import { setCommand } from './commands/set.js';
import { exportCommand } from './commands/export.js';
import { copyCommand } from './commands/copy.js';
import { importCommand } from './commands/import.js';
import { resolveCommand } from './commands/resolve.js';
import { runCommand } from './commands/run.js';
import { inspectCommand } from './commands/inspect.js';
import { vaultsCommand } from './commands/vaults.js';
import { completionCommand } from './commands/completion.js';
import { getManyCommand } from './commands/get-many.js';
import { templateApplyCommand, templateCreateCommand, templateListCommand } from './commands/template.js';
import { setRetryOptions } from './utils/op.js';
import { isRetryDisabled } from './utils/retry.js';
import { loadSessionCacheIntoEnv, persistSessionCacheFromEnv } from './utils/session-cache.js';
import { interactiveCommand } from './commands/interactive.js';
import { whoamiCommand } from './commands/whoami.js';

// Dynamic version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('ops')
  .description('Easy secret retrieval from 1Password with smart fallbacks')
  .version(pkg.version)
  .addHelpCommand()
  .showHelpAfterError()
  .showSuggestionAfterError()
  .option('--retry <count>', 'max retry attempts for transient failures (default: 3, env: OPS_RETRY_COUNT)')
  .option('--no-retry', 'disable retry logic (env: OPS_NO_RETRY=1)')
  .hook('preAction', (thisCommand) => {
    loadSessionCacheIntoEnv();
    const opts = thisCommand.opts();

    // Configure retry options based on CLI flags
    if (opts.retry === false || isRetryDisabled()) {
      // --no-retry flag or OPS_NO_RETRY=1
      setRetryOptions({ maxRetries: 0 });
    } else if (typeof opts.retry === 'string') {
      // --retry N flag
      const retryCount = parseInt(opts.retry, 10);
      if (!isNaN(retryCount) && retryCount >= 0) {
        setRetryOptions({ maxRetries: retryCount });
      }
    }
    // Otherwise use defaults from environment or built-in defaults
  })
  .hook('postAction', () => {
    persistSessionCacheFromEnv();
  })
  .action(() => {
    // Show help when no command is provided (exit 0, not 1)
    program.outputHelp();
  });

program.enablePositionalOptions();

program
  .command('get <name>')
  .description('Get a secret from 1Password (with fallback prompt if not found)')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option('-s, --silent', 'output only the secret value (alias for --plain)')
  .option('--plain', 'output only the secret value')
  .option('--json', 'output as JSON')
  .option('--no-input', 'disable prompts (fail if input is required)')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(getCommand);

program
  .command('get-many <names...>')
  .alias('gets')
  .description('Get multiple secrets at once')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option('-j, --json', 'output as JSON object')
  .option('-e, --env', 'output as KEY="value" pairs')
  .option('--plain', 'output values only (one per line)')
  .option('--parallel <count>', 'max concurrent requests (default: 5)', (v) => parseInt(v, 10))
  .option('--continue-on-error', 'continue if some secrets fail')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(getManyCommand);

program
  .command('inspect <name>')
  .description('Inspect an item to see available fields')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(inspectCommand);

program
  .command('set <name>')
  .description('Store a secret in 1Password')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option('--value <value>', 'secret value (use "-" to read from stdin)')
  .option('--value-file <file>', 'read secret value from file (use "-" for stdin)')
  .option('-y, --force', 'overwrite without confirmation')
  .option('--no-input', 'disable prompts (fail if input is required)')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(setCommand);

program
  .command('run')
  .description('Run a command with secrets injected into the environment')
  .argument('<command...>', 'command to run')
  .passThroughOptions()
  .allowUnknownOption(true)
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option(
    '-e, --env <pair>',
    'map env var to secret name (repeatable, e.g. --env API_KEY=MY_SECRET)',
    (value, previous: string[] = []) => [...previous, value],
    []
  )
  .option('--env-file <file>', 'env mapping file (default: .env.ops)')
  .option('--parallel <count>', 'max concurrent secret lookups (default: 5)', (v) => parseInt(v, 10))
  .option('--verbose', 'show which secrets are being injected')
  .option('--no-color', 'disable color output')
  .action(runCommand);

program
  .command('copy <name>')
  .description('Copy a secret to the clipboard and clear it after a delay')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option('--ttl <seconds>', 'seconds before clipboard is cleared', (value) => Number(value), 30)
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(copyCommand);

program
  .command('list')
  .description('List all items in a vault')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-s, --search <query>', 'search for items by title')
  .option('-j, --json', 'output as JSON')
  .option('--plain', 'output as tab-delimited text')
  .option('--favorites', 'show only favorite items')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(listCommand);

program
  .command('search <query>')
  .description('Search items by title in a vault')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-j, --json', 'output as JSON')
  .option('--plain', 'output as tab-delimited text')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action((query, options) =>
    listCommand({
      vault: options.vault,
      json: options.json,
      plain: options.plain,
      search: query,
      quiet: options.quiet,
      color: options.color,
    })
  );

program
  .command('favorites')
  .description('List favorite items in a vault')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-j, --json', 'output as JSON')
  .option('--plain', 'output as tab-delimited text')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action((options) =>
    listCommand({
      ...options,
      favorites: true,
    })
  );

program
  .command('vaults')
  .description('List available vaults')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(vaultsCommand);

program
  .command('export')
  .description('Export secrets as .env or JSON')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --format <format>', 'output format (env|json)')
  .option('-j, --json', 'alias for --format json')
  .option('-o, --output <file>', 'output file (default: stdout, use "-" for stdout)')
  .option('--filter <pattern>', 'filter items by glob pattern (e.g. "API_*")')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(exportCommand);

program
  .command('import [file]')
  .description('Import secrets from a .env file into 1Password (use "-" for stdin)')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('--dry-run', 'preview what would be imported without modifying')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(importCommand);

program
  .command('resolve <shareLink>')
  .description('Resolve a 1Password share link to ops references')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(resolveCommand);

program
  .command('interactive')
  .alias('i')
  .description('Browse vaults and items interactively')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option('--no-color', 'disable color output')
  .action(interactiveCommand);

program
  .command('whoami')
  .description('Show current 1Password account and vault info')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(whoamiCommand);

program
  .command('completion [shell]')
  .description('Generate shell completion script (bash, zsh, fish)')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(completionCommand);

const template = program
  .command('template')
  .description('Manage secret templates');

template
  .command('list')
  .description('List available templates')
  .option('-j, --json', 'output as JSON')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(templateListCommand);

template
  .command('create <name>')
  .description('Create a custom template')
  .option('--fields <fields>', 'comma or space separated field names (e.g. API_KEY,API_SECRET)')
  .option('--description <description>', 'template description')
  .option('-y, --force', 'overwrite existing custom template')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(templateCreateCommand);

template
  .command('apply <name>')
  .description('Apply a template and create secrets')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
  .option('-f, --field <field>', 'field name (default: OPS_FIELD or password)')
  .option(
    '--value <pair>',
    'provide field value (repeatable, e.g. --value API_KEY=secret)',
    (value, previous: string[] = []) => [...previous, value],
    []
  )
  .option('--no-input', 'disable prompts (fail if input is required)')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(templateApplyCommand);

// Error handling
process.on('uncaughtException', (error: Error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error: Error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});

program.parse();