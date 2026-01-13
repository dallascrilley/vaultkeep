import chalk from 'chalk';
import ora from 'ora';
import { listItems, searchItems, listFavorites, checkOpCli } from '../utils/op.js';
import { OpError } from '../utils/types.js';

export interface ListOptions {
  vault?: string;
  search?: string;
  json?: boolean;
  favorites?: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  try {
    checkOpCli();

    const vault = options.vault || 'Private';
    const loadingMsg = options.favorites
      ? `Loading favorites from vault "${vault}"...`
      : `Loading items from vault "${vault}"...`;
    const spinner = ora(loadingMsg).start();

    let items = options.favorites
      ? listFavorites(vault)
      : options.search
      ? searchItems(options.search, vault)
      : listItems(vault);

    spinner.stop();

    if (items.length === 0) {
      const msg = options.favorites
        ? 'No favorites found. Mark items as favorites in 1Password to see them here.'
        : 'No items found.';
      console.log(chalk.yellow(msg));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    // Display as table
    const header = options.favorites
      ? `\nFavorites in vault "${vault}":\n`
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
