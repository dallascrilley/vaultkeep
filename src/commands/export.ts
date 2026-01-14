import { writeFileSync } from 'fs';
import chalk from 'chalk';
import { listItems, getItem, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveFormat,
  resolveVault,
} from '../utils/cli.js';
import { OpError, ExportOptions } from '../utils/types.js';

export async function exportCommand(options: ExportOptions): Promise<void> {
  try {
    checkOpCli();

    if (options.json && options.format && options.format !== 'json') {
      throw new OpError('Use either --json or --format, not both.', 2);
    }

    const vault = resolveVault(options.vault);
    const envQuiet = resolveBooleanOption(undefined, 'OPS_QUIET');
    const quiet = options.quiet === true || envQuiet;
    const envNoColor = resolveBooleanOption(undefined, 'OPS_NO_COLOR');
    const noColor = options.color === false || envNoColor;
    const format = resolveFormat(options.json ? 'json' : options.format);

    applyColorConfig(noColor);

    const outputToStdout = !options.output || options.output === '-';
    const quietSpinner = quiet || outputToStdout || format === 'json';
    const spinner = createSpinner(`Exporting secrets from vault "${vault}"...`, quietSpinner);

    // Get all items from vault
    const items = listItems(vault);

    if (items.length === 0) {
      if (!quietSpinner) {
        spinner.warn(chalk.yellow('No items found in vault.'));
      }
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

    if (!quietSpinner) {
      spinner.stop();
    }

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
    if (!outputToStdout) {
      writeFileSync(options.output!, output);
      if (!quiet) {
        console.log(
          chalk.green(
            `✓ Exported ${Object.keys(secrets).length} secrets to ${options.output}`
          )
        );
      }
    } else {
      console.log(output);
    }

    if (!quiet && !outputToStdout) {
      console.log(
        chalk.gray(`\n${Object.keys(secrets).length} secrets exported from "${vault}"`)
      );
    }
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
