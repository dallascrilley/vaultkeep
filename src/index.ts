#!/usr/bin/env node
import { Command } from 'commander';
import { getCommand } from './commands/get.js';
import { listCommand } from './commands/list.js';
import { setCommand } from './commands/set.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { resolveCommand } from './commands/resolve.js';

const program = new Command();

program
  .name('ops')
  .description('Easy secret retrieval from 1Password with smart fallbacks')
  .version('1.0.0');

program
  .command('get <name>')
  .description('Get a secret from 1Password (with fallback prompt if not found)')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-f, --field <field>', 'field name', 'password')
  .option('-s, --silent', 'output only the secret value (for piping)')
  .action(getCommand);

program
  .command('set <name>')
  .description('Store a secret in 1Password')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-f, --field <field>', 'field name', 'password')
  .option('--value <value>', 'secret value (will prompt if not provided)')
  .action(setCommand);

program
  .command('list')
  .description('List all items in a vault')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-s, --search <query>', 'search for items by title')
  .option('-j, --json', 'output as JSON')
  .option('--favorites', 'show only favorite items')
  .action(listCommand);

program
  .command('search <query>')
  .description('Search items by title in a vault')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-j, --json', 'output as JSON')
  .action((query, options) =>
    listCommand({ vault: options.vault, json: options.json, search: query })
  );

program
  .command('favorites')
  .description('List favorite items in a vault')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-j, --json', 'output as JSON')
  .action((options) => listCommand({ ...options, favorites: true }));

program
  .command('export')
  .description('Export secrets as .env or JSON')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .option('-f, --format <format>', 'output format (env|json)', 'env')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .action(exportCommand);

program
  .command('import <file>')
  .description('Import secrets from a .env file into 1Password')
  .option('-v, --vault <vault>', 'vault name', 'Private')
  .action(importCommand);

program
  .command('resolve <shareLink>')
  .description('Resolve a 1Password share link to ops references')
  .option('-j, --json', 'output as JSON')
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
