#!/usr/bin/env node
import { Command } from 'commander';
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

const program = new Command();

program
  .name('ops')
  .description('Easy secret retrieval from 1Password with smart fallbacks')
  .version('1.0.0')
  .addHelpCommand()
  .showHelpAfterError()
  .showSuggestionAfterError()
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
  .option('--force', 'overwrite without confirmation')
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
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--no-color', 'disable color output')
  .action(exportCommand);

program
  .command('import <file>')
  .description('Import secrets from a .env file into 1Password')
  .option('-v, --vault <vault>', 'vault name (default: OPS_VAULT or Private)')
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
