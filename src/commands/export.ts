import { writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';
import picomatch from 'picomatch';
import { listItems, getItem, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveFormat,
  resolveVault,
} from '../utils/cli.js';
import { OpError, ExportOptions, OpItem } from '../utils/types.js';
import type oraType from 'ora';

export interface ExportDeps {
  checkOpCli: () => void;
  listItems: (vault: string) => OpItem[];
  getItem: (title: string, vault: string) => OpItem | null;
  existsSync: (path: string) => boolean;
  dirname: (path: string) => string;
  writeFileSync: (path: string, content: string) => void;
  createSpinner: (text: string, quiet: boolean) => ReturnType<typeof oraType>;
}

const defaultDeps: ExportDeps = {
  checkOpCli,
  listItems,
  getItem,
  existsSync,
  dirname,
  writeFileSync,
  createSpinner,
};

export function createExportCommand(deps: ExportDeps = defaultDeps) {
  return async function exportCommand(options: ExportOptions): Promise<void> {
    try {
      deps.checkOpCli();

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

      // Validate output path early (before fetching secrets)
      if (options.output && options.output !== '-') {
        const dir = deps.dirname(options.output);
        if (!deps.existsSync(dir)) {
          throw new OpError(`Output directory not found: ${dir}`, 2);
        }
      }

      // Compile filter pattern if provided
      const filterMatcher = options.filter ? picomatch(options.filter, { nocase: true }) : null;

      const outputToStdout = !options.output || options.output === '-';
      const quietSpinner = quiet || outputToStdout || format === 'json';
      const spinner = deps.createSpinner(`Exporting secrets from vault "${vault}"...`, quietSpinner);

      // Get all items from vault
      let items = deps.listItems(vault);

      // Helper to convert title to env var format
      const toEnvKey = (title: string): string =>
        title
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_');

      // Apply filter if specified (matches converted env var names, not raw titles)
      if (filterMatcher) {
        items = items.filter(item => filterMatcher(toEnvKey(item.title)));
      }

      if (items.length === 0) {
        if (!quietSpinner) {
          const filterMsg = options.filter ? ` matching "${options.filter}"` : '';
          spinner.warn(chalk.yellow(`No items found in vault${filterMsg}.`));
        }
        return;
      }

      // Fetch full details for each item
      const secrets: Record<string, string> = {};

      for (const item of items) {
        const fullItem = deps.getItem(item.title, vault);
        if (!fullItem?.fields) continue;

        // Find password or concealed field
        const secretField = fullItem.fields.find(
          (f) => f.type === 'CONCEALED' || f.id === 'password'
        );

        if (secretField?.value) {
          secrets[toEnvKey(item.title)] = secretField.value;
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
        deps.writeFileSync(options.output!, output);
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
  };
}

// Default export for CLI usage
export const exportCommand = createExportCommand();