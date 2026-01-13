import { writeFileSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { listItems, getItem, checkOpCli } from '../utils/op.js';
import { OpError, ExportOptions } from '../utils/types.js';

export async function exportCommand(options: ExportOptions): Promise<void> {
  try {
    checkOpCli();

    const vault = options.vault || 'Private';
    const format = options.format || 'env';
    const spinner = ora(`Exporting secrets from vault "${vault}"...`).start();

    // Get all items from vault
    const items = listItems(vault);

    if (items.length === 0) {
      spinner.warn(chalk.yellow('No items found in vault.'));
      return;
    }

    // Fetch full details for each item
    const secrets: Record<string, string> = {};

    for (const item of items) {
      const fullItem = getItem(item.title, vault);
      if (!fullItem?.fields) continue;

      // Find password or concealed field
      const secretField = fullItem.fields.find(
        (f) => f.type === 'CONCEALED' || f.id === 'password'
      );

      if (secretField?.value) {
        // Convert title to env var format (uppercase, replace spaces/hyphens with underscore)
        const envKey = item.title
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_');

        secrets[envKey] = secretField.value;
      }
    }

    spinner.stop();

    // Format output
    let output: string;

    if (format === 'json') {
      output = JSON.stringify(secrets, null, 2);
    } else {
      // .env format
      output = Object.entries(secrets)
        .map(([key, value]) => {
          // Escape quotes and newlines
          const escapedValue = value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n');
          return `${key}="${escapedValue}"`;
        })
        .join('\n');
    }

    // Output to file or stdout
    if (options.output) {
      writeFileSync(options.output, output);
      console.log(
        chalk.green(`✓ Exported ${Object.keys(secrets).length} secrets to ${options.output}`)
      );
    } else {
      console.log(output);
    }

    console.log(
      chalk.gray(`\n${Object.keys(secrets).length} secrets exported from "${vault}"`)
    );
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
