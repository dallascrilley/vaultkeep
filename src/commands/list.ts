import chalk from 'chalk';
import { listItems, searchItems, listFavorites, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface ListOptions {
  vault?: string;
  search?: string;
  json?: boolean;
  plain?: boolean;
  favorites?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  try {
    checkOpCli();

    if (options.json && options.plain) {
      throw new OpError('Use either --json or --plain, not both.', 2);
    }

    const vault = resolveVault(options.vault);
    const envQuiet = resolveBooleanOption(undefined, 'OPS_QUIET');
    const quiet = options.quiet === true || envQuiet;
    const envNoColor = resolveBooleanOption(undefined, 'OPS_NO_COLOR');
    const noColor = options.color === false || envNoColor;

    applyColorConfig(noColor);

    const loadingMsg = options.favorites
      ? `Loading favorites from vault "${vault}"...`
      : options.search
      ? `Searching for "${options.search}" in vault "${vault}"...`
      : `Loading items from vault "${vault}"...`;
    const quietSpinner = Boolean(quiet || options.json || options.plain);
    const spinner = createSpinner(loadingMsg, quietSpinner);

    const items = options.favorites
      ? listFavorites(vault)
      : options.search
      ? searchItems(options.search, vault)
      : listItems(vault);

    if (!quietSpinner) {
      spinner.stop();
    }

    if (items.length === 0) {
      if (options.json) {
        console.log('[]');
        return;
      }
      if (options.plain) {
        return;
      }

      const msg = options.favorites
        ? 'No favorites found. Mark items as favorites in 1Password to see them here.'
        : options.search
        ? `No items found matching "${options.search}".`
        : 'No items found.';
      console.log(chalk.yellow(msg));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (options.plain) {
      items.forEach((item) => {
        const favorite = item.favorite ? 'true' : 'false';
        console.log(`${item.title}\t${item.category}\t${item.id}\t${favorite}`);
      });
      return;
    }

    // Display as table
    const header = options.favorites
      ? `\nFavorites in vault "${vault}":\n`
      : options.search
      ? `\nSearch results for "${options.search}" in vault "${vault}":\n`
      : `\nItems in vault "${vault}":\n`;
    console.log(chalk.bold.cyan(header));

    const maxTitleLength = Math.max(
      ...items.map((item) => item.title.length),
      10
    );

    // Header
    console.log(
      chalk.gray(
        `${'TITLE'.padEnd(maxTitleLength + 2)} ${'CATEGORY'.padEnd(15)} ID`
      )
    );
    console.log(chalk.gray('─'.repeat(maxTitleLength + 50)));

    // Items
    items.forEach((item) => {
      const star = item.favorite ? chalk.yellow('⭐ ') : '   ';
      console.log(
        `${star}${chalk.white(item.title.padEnd(maxTitleLength - 1))} ${chalk.cyan(
          item.category.padEnd(15)
        )} ${chalk.gray(item.id)}`
      );
    });

    const totalMsg = options.favorites
      ? `\nTotal: ${items.length} favorites`
      : options.search
      ? `\nTotal: ${items.length} matching items`
      : `\nTotal: ${items.length} items`;
    console.log(chalk.gray(totalMsg));
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
